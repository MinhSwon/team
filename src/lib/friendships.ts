import type {
  Friendship,
  FriendshipStatus,
  NotificationType,
  Post,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  MAX_SERIALIZABLE_ATTEMPTS,
  withSerializableRetry,
} from "@/lib/serializable";

type NewFriendship = Pick<
  Friendship,
  "requesterId" | "addresseeId" | "pairKey"
>;

type NewNotification = {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  friendshipId: string;
};

export type FriendUser = {
  id: string;
  username: string;
  name: string;
  image: string | null;
};

export type FriendListItem = {
  id: string;
  user: FriendUser;
};

export type FriendLists = {
  accepted: FriendListItem[];
  incoming: FriendListItem[];
  outgoing: FriendListItem[];
};

export interface FriendshipStore {
  findFriendshipByPairKey(pairKey: string): Promise<Friendship | null>;
  findFriendshipById(id: string): Promise<Friendship | null>;
  createFriendship(input: NewFriendship): Promise<Friendship>;
  transitionPendingFriendship(input: {
    id: string;
    addresseeId: string;
    status: Extract<FriendshipStatus, "ACCEPTED" | "REJECTED">;
  }): Promise<Friendship | null>;
  deleteFriendship(id: string): Promise<Friendship>;
  createNotification(input: NewNotification): Promise<void>;
  findVisiblePost(viewerId: string, id: string): Promise<Post | null>;
}

export type FriendshipLookup = Pick<
  FriendshipStore,
  "findFriendshipByPairKey"
>;

export type PostVisibilityStore = Pick<
  FriendshipStore,
  "findVisiblePost"
>;

export interface FriendshipPersistence extends FriendshipStore {
  transaction<T>(
    operation: (store: FriendshipStore) => Promise<T>,
  ): Promise<T>;
}

export class FriendshipError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "SELF_REQUEST"
      | "DUPLICATE_REQUEST"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATE",
    public readonly status: number,
  ) {
    super(message);
    this.name = "FriendshipError";
  }
}

export function friendPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

const friendUserSelect = {
  id: true,
  username: true,
  name: true,
  image: true,
} as const;

export async function getFriendLists(userId: string): Promise<FriendLists> {
  const [accepted, incoming, outgoing] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: friendUserSelect },
        addressee: { select: friendUserSelect },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: { requester: { select: friendUserSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.friendship.findMany({
      where: { requesterId: userId, status: "PENDING" },
      include: { addressee: { select: friendUserSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    accepted: accepted.map((friendship) => ({
      id: friendship.id,
      user:
        friendship.requesterId === userId
          ? friendship.addressee
          : friendship.requester,
    })),
    incoming: incoming.map((friendship) => ({
      id: friendship.id,
      user: friendship.requester,
    })),
    outgoing: outgoing.map((friendship) => ({
      id: friendship.id,
      user: friendship.addressee,
    })),
  };
}

function createPrismaStore(
  client: Pick<Prisma.TransactionClient, "friendship" | "notification" | "post">,
): FriendshipStore {
  return {
    findFriendshipByPairKey: (pairKey) =>
      client.friendship.findUnique({ where: { pairKey } }),
    findFriendshipById: (id) =>
      client.friendship.findUnique({ where: { id } }),
    createFriendship: (data) => client.friendship.create({ data }),
    transitionPendingFriendship: async ({ id, addresseeId, status }) => {
      const result = await client.friendship.updateMany({
        where: { id, addresseeId, status: "PENDING" },
        data: { status },
      });
      if (result.count === 0) return null;
      return client.friendship.findUnique({ where: { id } });
    },
    deleteFriendship: (id) => client.friendship.delete({ where: { id } }),
    createNotification: async (data) => {
      await client.notification.create({ data });
    },
    findVisiblePost: (viewerId, id) =>
      client.post.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [
            { authorId: viewerId },
            {
              author: {
                requestsSent: {
                  some: { addresseeId: viewerId, status: "ACCEPTED" },
                },
              },
            },
            {
              author: {
                requestsIn: {
                  some: { requesterId: viewerId, status: "ACCEPTED" },
                },
              },
            },
          ],
        },
      }),
  };
}

const defaultStore = createPrismaStore(prisma);

const defaultPersistence: FriendshipPersistence = {
  ...defaultStore,
  transaction: (operation) =>
    withSerializableRetry(
      () =>
        prisma.$transaction(
          (transaction) => operation(createPrismaStore(transaction)),
          { isolationLevel: "Serializable" },
        ),
      MAX_SERIALIZABLE_ATTEMPTS,
    ),
};

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function requestFriendship(
  requesterId: string,
  addresseeId: string,
  persistence: FriendshipPersistence = defaultPersistence,
): Promise<Friendship> {
  if (requesterId === addresseeId) {
    throw new FriendshipError(
      "You cannot send a friend request to yourself",
      "SELF_REQUEST",
      400,
    );
  }

  try {
    return await persistence.transaction(async (store) => {
      const friendship = await store.createFriendship({
        requesterId,
        addresseeId,
        pairKey: friendPairKey(requesterId, addresseeId),
      });
      await store.createNotification({
        recipientId: addresseeId,
        actorId: requesterId,
        type: "FRIEND_REQUEST",
        friendshipId: friendship.id,
      });
      return friendship;
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      throw new FriendshipError(
        "A friendship or request already exists",
        "DUPLICATE_REQUEST",
        409,
      );
    }
    if (hasPrismaCode(error, "P2003")) {
      throw new FriendshipError("Addressee not found", "NOT_FOUND", 404);
    }
    throw error;
  }
}

export async function respondToFriendRequest(
  currentUserId: string,
  friendshipId: string,
  action: "accept" | "reject",
  persistence: FriendshipPersistence = defaultPersistence,
): Promise<Friendship> {
  return persistence.transaction(async (store) => {
    const friendship = await store.findFriendshipById(friendshipId);

    if (!friendship) {
      throw new FriendshipError(
        "Friend request not found",
        "NOT_FOUND",
        404,
      );
    }
    if (friendship.addresseeId !== currentUserId) {
      throw new FriendshipError(
        "Only the addressee can respond to this request",
        "FORBIDDEN",
        403,
      );
    }
    if (friendship.status !== "PENDING") {
      throw new FriendshipError(
        "Friend request is no longer pending",
        "INVALID_STATE",
        409,
      );
    }

    const updated = await store.transitionPendingFriendship({
      id: friendshipId,
      addresseeId: currentUserId,
      status: action === "accept" ? "ACCEPTED" : "REJECTED",
    });

    if (!updated) {
      throw new FriendshipError(
        "Friend request is no longer pending",
        "INVALID_STATE",
        409,
      );
    }

    if (action === "accept") {
      await store.createNotification({
        recipientId: friendship.requesterId,
        actorId: currentUserId,
        type: "FRIEND_ACCEPTED",
        friendshipId,
      });
    }

    return updated;
  });
}

export async function removeFriendship(
  currentUserId: string,
  friendshipId: string,
  persistence: FriendshipPersistence = defaultPersistence,
): Promise<Friendship> {
  return persistence.transaction(async (store) => {
    const friendship = await store.findFriendshipById(friendshipId);

    if (!friendship) {
      throw new FriendshipError("Friendship not found", "NOT_FOUND", 404);
    }
    if (
      friendship.requesterId !== currentUserId &&
      friendship.addresseeId !== currentUserId
    ) {
      throw new FriendshipError(
        "Only participants can remove this friendship",
        "FORBIDDEN",
        403,
      );
    }
    if (friendship.status !== "ACCEPTED") {
      throw new FriendshipError(
        "Only accepted friendships can be removed",
        "INVALID_STATE",
        409,
      );
    }

    return store.deleteFriendship(friendshipId);
  });
}

export async function areFriends(
  a: string,
  b: string,
  persistence: FriendshipLookup = defaultPersistence,
): Promise<boolean> {
  if (a === b) return false;

  const friendship = await persistence.findFriendshipByPairKey(
    friendPairKey(a, b),
  );
  return friendship?.status === "ACCEPTED";
}

export async function canViewUser(
  viewerId: string,
  ownerId: string,
  persistence: FriendshipLookup = defaultPersistence,
): Promise<boolean> {
  return (
    viewerId === ownerId ||
    (await areFriends(viewerId, ownerId, persistence))
  );
}

export async function assertCanViewPost(
  viewerId: string,
  postId: string,
  persistence: PostVisibilityStore = defaultPersistence,
): Promise<Post> {
  const post = await persistence.findVisiblePost(viewerId, postId);
  if (!post) {
    throw new FriendshipError("Post not found", "NOT_FOUND", 404);
  }

  return post;
}

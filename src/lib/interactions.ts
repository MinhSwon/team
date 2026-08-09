import type {
  Comment,
  Notification,
  NotificationType,
  Place,
  Post,
  PostLike,
  Prisma,
  UserSavedPlace,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanViewPost,
  FriendshipError,
  type PostVisibilityStore,
} from "@/lib/friendships";
import {
  saveAndSharePlace,
  type SavePlaceInput,
} from "@/lib/posts";
import {
  MAX_SERIALIZABLE_ATTEMPTS,
  withSerializableRetry,
} from "@/lib/serializable";

type ActorSummary = {
  id: string;
  name: string;
  username: string;
  image: string | null;
};

type NewInteractionNotification = {
  recipientId: string;
  actorId: string;
  type: Extract<NotificationType, "POST_LIKED" | "POST_COMMENTED">;
  postId: string;
  commentId: string | null;
};

export type ResaveSource = {
  post: Post;
  place: Place;
};

export type NotificationItem = Notification & {
  actor: ActorSummary;
  post: {
    id: string;
    placeId: string;
    placeName: string;
  } | null;
  comment: Pick<Comment, "id" | "body"> | null;
};

export interface InteractionStore extends PostVisibilityStore {
  findLike(postId: string, userId: string): Promise<PostLike | null>;
  createLike(postId: string, userId: string): Promise<void>;
  deleteLike(postId: string, userId: string): Promise<void>;
  countLikes(postId: string): Promise<number>;
  createComment(
    postId: string,
    authorId: string,
    body: string,
  ): Promise<Comment>;
  countComments(postId: string): Promise<number>;
  createNotification(input: NewInteractionNotification): Promise<void>;
  markNotificationsRead(
    recipientId: string,
    ids: string[] | null,
    readAt: Date,
  ): Promise<number>;
}

export interface InteractionPersistence {
  transaction<T>(
    operation: (store: InteractionStore) => Promise<T>,
  ): Promise<T>;
  findLike(postId: string, userId: string): Promise<PostLike | null>;
  countLikes(postId: string): Promise<number>;
  findResaveSource(
    userId: string,
    postId: string,
  ): Promise<ResaveSource | null>;
  countReshares(postId: string): Promise<number>;
  listNotifications(
    recipientId: string,
    take: number,
  ): Promise<NotificationItem[]>;
}

type SaveAndShare = (
  userId: string,
  input: SavePlaceInput,
) => Promise<{ savedPlace: UserSavedPlace; post: Post }>;

export type ResaveDependencies = {
  persistence?: InteractionPersistence;
  saveAndSharePlace?: SaveAndShare;
};

export class InteractionError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_INPUT" | "NOT_FOUND",
    public readonly status: number,
  ) {
    super(message);
    this.name = "InteractionError";
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function visiblePost(
  userId: string,
  postId: string,
  store: PostVisibilityStore,
): Promise<Post> {
  try {
    return await assertCanViewPost(userId, postId, store);
  } catch (error) {
    if (error instanceof FriendshipError) {
      throw new InteractionError("Post not found", "NOT_FOUND", 404);
    }
    throw error;
  }
}

function commentBody(value: unknown): string {
  if (typeof value !== "string") {
    throw new InteractionError(
      "Comment must be text",
      "INVALID_INPUT",
      400,
    );
  }
  const body = value.trim();
  if (!body || body.length > 1000) {
    throw new InteractionError(
      "Comment must be between 1 and 1000 characters",
      "INVALID_INPUT",
      400,
    );
  }
  return body;
}

async function visiblePostAndLike(
  userId: string,
  postId: string,
  store: InteractionStore,
) {
  const post = await visiblePost(userId, postId, store);
  return {
    post,
    existing: await store.findLike(postId, userId),
  };
}

async function createVisibleComment(
  store: InteractionStore,
  post: Post,
  userId: string,
  postId: string,
  body: string,
) {
  const comment = await store.createComment(postId, userId, body);
  if (post.authorId !== userId) {
    await store.createNotification({
      recipientId: post.authorId,
      actorId: userId,
      type: "POST_COMMENTED",
      postId,
      commentId: comment.id,
    });
  }
  return { comment, count: await store.countComments(postId) };
}

function prismaStore(
  client: Pick<
    Prisma.TransactionClient,
    "comment" | "friendship" | "notification" | "post" | "postLike"
  >,
): InteractionStore {
  return {
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
    findLike: (postId, userId) =>
      client.postLike.findUnique({
        where: { postId_userId: { postId, userId } },
      }),
    createLike: async (postId, userId) => {
      await client.postLike.create({ data: { postId, userId } });
    },
    deleteLike: async (postId, userId) => {
      await client.postLike.delete({
        where: { postId_userId: { postId, userId } },
      });
    },
    countLikes: (postId) => client.postLike.count({ where: { postId } }),
    createComment: (postId, authorId, body) =>
      client.comment.create({ data: { postId, authorId, body } }),
    countComments: (postId) =>
      client.comment.count({ where: { postId, deletedAt: null } }),
    createNotification: async (data) => {
      await client.notification.create({ data });
    },
    markNotificationsRead: async (recipientId, ids, readAt) => {
      const result = await client.notification.updateMany({
        where: {
          recipientId,
          readAt: null,
          ...(ids ? { id: { in: ids } } : {}),
        },
        data: { readAt },
      });
      return result.count;
    },
  };
}

const notificationInclude = {
  actor: {
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
    },
  },
  post: {
    select: {
      id: true,
      savedPlace: {
        select: {
          place: { select: { id: true, name: true } },
        },
      },
    },
  },
  comment: { select: { id: true, body: true } },
} satisfies Prisma.NotificationInclude;

type PrismaNotificationItem = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

function notificationItem(
  notification: PrismaNotificationItem,
): NotificationItem {
  const { post, ...item } = notification;
  return {
    ...item,
    post: post
      ? {
          id: post.id,
          placeId: post.savedPlace.place.id,
          placeName: post.savedPlace.place.name,
        }
      : null,
  };
}

const defaultPersistence: InteractionPersistence = {
  transaction: (operation) =>
    withSerializableRetry(
      () =>
        prisma.$transaction(
          (transaction) => operation(prismaStore(transaction)),
          { isolationLevel: "Serializable" },
        ),
      MAX_SERIALIZABLE_ATTEMPTS,
    ),
  findLike: (postId, userId) =>
    prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    }),
  countLikes: (postId) => prisma.postLike.count({ where: { postId } }),
  findResaveSource: async (userId, postId) => {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
        OR: [
          { authorId: userId },
          {
            author: {
              requestsSent: {
                some: { addresseeId: userId, status: "ACCEPTED" },
              },
            },
          },
          {
            author: {
              requestsIn: {
                some: { requesterId: userId, status: "ACCEPTED" },
              },
            },
          },
        ],
      },
      include: { savedPlace: { include: { place: true } } },
    });
    return post ? { post, place: post.savedPlace.place } : null;
  },
  countReshares: (postId) =>
    prisma.post.count({
      where: { sourcePostId: postId, deletedAt: null },
    }),
  listNotifications: async (recipientId, take) => {
    const notifications = await prisma.notification.findMany({
      where: { recipientId },
      include: notificationInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return notifications.map(notificationItem);
  },
};

export async function togglePostLike(
  userId: string,
  postId: string,
  liked: boolean,
  persistence: InteractionPersistence = defaultPersistence,
): Promise<{ liked: boolean; count: number }> {
  try {
    return await persistence.transaction(async (store) => {
      const { post, existing } = await visiblePostAndLike(
        userId,
        postId,
        store,
      );
      if (!liked) {
        if (!existing) {
          return { liked: false, count: await store.countLikes(postId) };
        }
        await store.deleteLike(postId, userId);
        return { liked: false, count: await store.countLikes(postId) };
      }

      if (existing) {
        return { liked: true, count: await store.countLikes(postId) };
      }
      await store.createLike(postId, userId);
      if (post.authorId !== userId) {
        await store.createNotification({
          recipientId: post.authorId,
          actorId: userId,
          type: "POST_LIKED",
          postId,
          commentId: null,
        });
      }
      return { liked: true, count: await store.countLikes(postId) };
    });
  } catch (error) {
    if (liked && hasPrismaCode(error, "P2002")) {
      const like = await persistence.findLike(postId, userId);
      if (like) {
        return {
          liked: true,
          count: await persistence.countLikes(postId),
        };
      }
    }
    if (!liked && hasPrismaCode(error, "P2025")) {
      const like = await persistence.findLike(postId, userId);
      if (!like) {
        return {
          liked: false,
          count: await persistence.countLikes(postId),
        };
      }
    }
    throw error;
  }
}

export async function createPostComment(
  userId: string,
  postId: string,
  value: unknown,
  persistence: InteractionPersistence = defaultPersistence,
): Promise<{ comment: Comment; count: number }> {
  const body = commentBody(value);
  return persistence.transaction(async (store) => {
    const post = await visiblePost(userId, postId, store);
    return createVisibleComment(store, post, userId, postId, body);
  });
}

export async function resavePost(
  userId: string,
  postId: string,
  dependencies: ResaveDependencies = {},
): Promise<{
  savedPlace: UserSavedPlace;
  post: Post;
  saved: true;
  count: number;
}> {
  const persistence = dependencies.persistence ?? defaultPersistence;
  const source = await persistence.findResaveSource(userId, postId);
  if (!source) {
    throw new InteractionError("Post not found", "NOT_FOUND", 404);
  }

  const result = await (
    dependencies.saveAndSharePlace ?? saveAndSharePlace
  )(userId, {
    place: {
      type: "search",
      candidate: {
        source: "local",
        id: source.place.id,
        name: source.place.name,
        address: source.place.address,
        area: source.place.area,
        latitude: source.place.latitude,
        longitude: source.place.longitude,
        website: source.place.website,
      },
    },
    rating: null,
    review: null,
    tags: [],
    images: [],
    sourcePostId: source.post.id,
    status: "SAVED",
  });

  return {
    ...result,
    saved: true,
    count: await persistence.countReshares(postId),
  };
}

export function listNotifications(
  userId: string,
  persistence: InteractionPersistence = defaultPersistence,
): Promise<NotificationItem[]> {
  return persistence.listNotifications(userId, 50);
}

export async function markNotificationsRead(
  userId: string,
  value: unknown,
  persistence: InteractionPersistence = defaultPersistence,
): Promise<number> {
  if (typeof value !== "object" || value === null) {
    throw new InteractionError(
      "Invalid notification read input",
      "INVALID_INPUT",
      400,
    );
  }
  const input = value as Record<string, unknown>;
  if (
    Object.hasOwn(input, "all") &&
    typeof input.all !== "boolean"
  ) {
    throw new InteractionError(
      "Invalid notification read input",
      "INVALID_INPUT",
      400,
    );
  }

  let ids: string[] | null = null;
  if (Object.hasOwn(input, "ids")) {
    if (
      !Array.isArray(input.ids) ||
      input.ids.some(
        (id) => typeof id !== "string" || !id.trim(),
      )
    ) {
      throw new InteractionError(
        "Invalid notification read input",
        "INVALID_INPUT",
        400,
      );
    }
    ids = [...new Set(input.ids.map((id) => id.trim()))];
    if (ids.length > 100) {
      throw new InteractionError(
        "Notification read IDs are limited to 100",
        "INVALID_INPUT",
        400,
      );
    }
  }

  if (input.all !== true && (!ids || ids.length === 0)) {
    throw new InteractionError(
      "Select notifications to mark as read",
      "INVALID_INPUT",
      400,
    );
  }

  return persistence.transaction((store) =>
    store.markNotificationsRead(
      userId,
      input.all === true ? null : ids,
      new Date(),
    ),
  );
}

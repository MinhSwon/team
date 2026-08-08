import assert from "node:assert/strict";
import test from "node:test";

import type {
  Friendship,
  FriendshipStatus,
  NotificationType,
  Post,
} from "@prisma/client";

import {
  FriendshipError,
  areFriends,
  assertCanViewPost,
  canViewUser,
  friendPairKey,
  removeFriendship,
  requestFriendship,
  respondToFriendRequest,
  type FriendshipPersistence,
  type FriendshipStore,
} from "./friendships";

type SavedNotification = {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  friendshipId: string;
};

class FakeFriendshipPersistence implements FriendshipPersistence {
  friendships: Friendship[] = [];
  notifications: SavedNotification[] = [];
  posts: Post[] = [];
  failNotification = false;
  missingAddressee = false;
  private nextId = 1;
  private responseGate: Promise<void> | null = null;
  private releaseResponses: (() => void) | null = null;
  private responseReadsRemaining = 0;

  async transaction<T>(
    operation: (store: FriendshipStore) => Promise<T>,
  ): Promise<T> {
    const undo: Array<() => void> = [];
    const store: FriendshipStore = {
      findFriendshipByPairKey: (pairKey) =>
        this.findFriendshipByPairKey(pairKey),
      findFriendshipById: (id) => this.findFriendshipById(id),
      createFriendship: async (input) => {
        const friendship = await this.createFriendship(input);
        undo.push(() => {
          this.friendships = this.friendships.filter(
            (item) => item.id !== friendship.id,
          );
        });
        return friendship;
      },
      transitionPendingFriendship: async (input) => {
        const previous = this.friendships.find(
          (friendship) => friendship.id === input.id,
        );
        const updated = await this.transitionPendingFriendship(input);

        if (updated && previous) {
          const snapshot = structuredClone(previous);
          undo.push(() => {
            const index = this.friendships.findIndex(
              (friendship) => friendship.id === input.id,
            );
            if (index >= 0) this.friendships[index] = snapshot;
          });
        }

        return updated;
      },
      deleteFriendship: async (id) => {
        const index = this.friendships.findIndex(
          (friendship) => friendship.id === id,
        );
        const friendship = await this.deleteFriendship(id);
        undo.push(() => {
          this.friendships.splice(index, 0, friendship);
        });
        return friendship;
      },
      createNotification: async (notification) => {
        await this.createNotification(notification);
        undo.push(() => {
          const index = this.notifications.lastIndexOf(notification);
          if (index >= 0) this.notifications.splice(index, 1);
        });
      },
      findPost: (id) => this.findPost(id),
    };

    try {
      return await operation(store);
    } catch (error) {
      for (const rollback of undo.reverse()) rollback();
      throw error;
    }
  }

  async findFriendshipByPairKey(pairKey: string) {
    return (
      this.friendships.find((friendship) => friendship.pairKey === pairKey) ??
      null
    );
  }

  async findFriendshipById(id: string) {
    const friendship =
      this.friendships.find((friendship) => friendship.id === id) ?? null

    if (this.responseGate && this.responseReadsRemaining > 0) {
      const snapshot = friendship ? structuredClone(friendship) : null;
      this.responseReadsRemaining -= 1;
      if (this.responseReadsRemaining === 0) this.releaseResponses?.();
      await this.responseGate;
      return snapshot;
    }

    return friendship;
  }

  async createFriendship(input: {
    requesterId: string;
    addresseeId: string;
    pairKey: string;
  }) {
    if (this.missingAddressee) throw { code: "P2003" };
    if (
      this.friendships.some(
        (friendship) => friendship.pairKey === input.pairKey,
      )
    ) {
      throw { code: "P2002" };
    }

    const now = new Date("2026-08-08T00:00:00.000Z");
    const friendship: Friendship = {
      id: `friendship-${this.nextId++}`,
      ...input,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
    this.friendships.push(friendship);
    return friendship;
  }

  async transitionPendingFriendship(input: {
    id: string;
    addresseeId: string;
    status: Extract<FriendshipStatus, "ACCEPTED" | "REJECTED">;
  }) {
    const index = this.friendships.findIndex(
      (friendship) =>
        friendship.id === input.id &&
        friendship.addresseeId === input.addresseeId &&
        friendship.status === "PENDING",
    );
    if (index < 0) return null;

    const updated: Friendship = {
      ...this.friendships[index],
      status: input.status,
      updatedAt: new Date("2026-08-08T00:01:00.000Z"),
    };
    this.friendships[index] = updated;
    return structuredClone(updated);
  }

  async deleteFriendship(id: string) {
    const friendship = await this.findFriendshipById(id);
    if (!friendship) throw { code: "P2025" };

    this.friendships = this.friendships.filter((item) => item.id !== id);
    return friendship;
  }

  async createNotification(notification: SavedNotification) {
    if (this.failNotification) throw new Error("notification failed");
    this.notifications.push(notification);
  }

  async findPost(id: string) {
    return this.posts.find((post) => post.id === id) ?? null;
  }

  addPost(authorId: string): Post {
    const now = new Date("2026-08-08T00:00:00.000Z");
    const post: Post = {
      id: `post-${this.posts.length + 1}`,
      authorId,
      savedPlaceId: `saved-${this.posts.length + 1}`,
      sourcePostId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.posts.push(post);
    return post;
  }

  competeNextResponses() {
    this.responseReadsRemaining = 2;
    this.responseGate = new Promise((resolve) => {
      this.releaseResponses = resolve;
    });
  }
}

test("friendPairKey is deterministic for an unordered pair", () => {
  assert.equal(friendPairKey("user-b", "user-a"), "user-a:user-b");
  assert.equal(friendPairKey("user-a", "user-b"), "user-a:user-b");
});

test("requestFriendship rejects self requests", async () => {
  const persistence = new FakeFriendshipPersistence();

  await assert.rejects(
    requestFriendship("user-a", "user-a", persistence),
    (error: unknown) =>
      error instanceof FriendshipError && error.code === "SELF_REQUEST",
  );
  assert.equal(persistence.friendships.length, 0);
  assert.equal(persistence.notifications.length, 0);
});

test("requestFriendship rejects duplicate unordered pairs", async () => {
  const persistence = new FakeFriendshipPersistence();

  await requestFriendship("user-a", "user-b", persistence);

  await assert.rejects(
    requestFriendship("user-b", "user-a", persistence),
    (error: unknown) =>
      error instanceof FriendshipError && error.code === "DUPLICATE_REQUEST",
  );
  assert.equal(persistence.friendships.length, 1);
  assert.deepEqual(
    persistence.notifications.map((notification) => notification.type),
    ["FRIEND_REQUEST"],
  );
});

test("requestFriendship reports a missing addressee", async () => {
  const persistence = new FakeFriendshipPersistence();
  persistence.missingAddressee = true;

  await assert.rejects(
    requestFriendship("user-a", "missing-user", persistence),
    (error: unknown) =>
      error instanceof FriendshipError &&
      error.code === "NOT_FOUND" &&
      error.status === 404,
  );
});

test("only addressee can accept and acceptance is mutual", async () => {
  const persistence = new FakeFriendshipPersistence();
  const request = await requestFriendship("user-a", "user-b", persistence);

  await assert.rejects(
    respondToFriendRequest("user-a", request.id, "accept", persistence),
    (error: unknown) =>
      error instanceof FriendshipError && error.code === "FORBIDDEN",
  );

  await respondToFriendRequest("user-b", request.id, "accept", persistence);

  assert.equal(await areFriends("user-a", "user-b", persistence), true);
  assert.equal(await areFriends("user-b", "user-a", persistence), true);
  assert.deepEqual(
    persistence.notifications.map((notification) => notification.type),
    ["FRIEND_REQUEST", "FRIEND_ACCEPTED"],
  );
});

test("addressee can reject a pending request", async () => {
  const persistence = new FakeFriendshipPersistence();
  const request = await requestFriendship("user-a", "user-b", persistence);

  const rejected = await respondToFriendRequest(
    "user-b",
    request.id,
    "reject",
    persistence,
  );

  assert.equal(rejected.status, "REJECTED");
  assert.equal(await areFriends("user-a", "user-b", persistence), false);
  assert.deepEqual(
    persistence.notifications.map((notification) => notification.type),
    ["FRIEND_REQUEST"],
  );
});

test("competing responses allow one transition and matching notification", async () => {
  for (const actions of [
    ["accept", "accept"],
    ["accept", "reject"],
  ] as const) {
    const persistence = new FakeFriendshipPersistence();
    const request = await requestFriendship("user-a", "user-b", persistence);
    persistence.competeNextResponses();

    const results = await Promise.allSettled(
      actions.map((action) =>
        respondToFriendRequest("user-b", request.id, action, persistence),
      ),
    );

    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof FriendshipError &&
          result.reason.code === "INVALID_STATE",
      ).length,
      1,
    );

    const finalStatus = persistence.friendships[0]?.status;
    assert.ok(finalStatus === "ACCEPTED" || finalStatus === "REJECTED");
    assert.equal(
      persistence.notifications.filter(
        (notification) => notification.type === "FRIEND_ACCEPTED",
      ).length,
      finalStatus === "ACCEPTED" ? 1 : 0,
    );
  }
});

test("participants can remove an accepted friendship", async () => {
  const persistence = new FakeFriendshipPersistence();
  const request = await requestFriendship("user-a", "user-b", persistence);
  await respondToFriendRequest("user-b", request.id, "accept", persistence);

  await assert.rejects(
    removeFriendship("user-c", request.id, persistence),
    (error: unknown) =>
      error instanceof FriendshipError && error.code === "FORBIDDEN",
  );

  await removeFriendship("user-a", request.id, persistence);

  assert.equal(await areFriends("user-a", "user-b", persistence), false);
  assert.equal(persistence.friendships.length, 0);
});

test("visibility changes only after acceptance", async () => {
  const persistence = new FakeFriendshipPersistence();
  const post = persistence.addPost("user-b");
  const request = await requestFriendship("user-a", "user-b", persistence);

  assert.equal(await canViewUser("user-a", "user-b", persistence), false);
  await assert.rejects(
    assertCanViewPost("user-a", post.id, persistence),
    (error: unknown) =>
      error instanceof FriendshipError && error.code === "FORBIDDEN",
  );

  await respondToFriendRequest("user-b", request.id, "accept", persistence);

  assert.equal(await canViewUser("user-a", "user-b", persistence), true);
  assert.equal(await canViewUser("user-b", "user-b", persistence), true);
  assert.equal(
    await assertCanViewPost("user-a", post.id, persistence),
    post,
  );
});

test("request notification failure rolls back friendship creation", async () => {
  const persistence = new FakeFriendshipPersistence();
  persistence.failNotification = true;

  await assert.rejects(
    requestFriendship("user-a", "user-b", persistence),
    /notification failed/,
  );

  assert.equal(persistence.friendships.length, 0);
  assert.equal(persistence.notifications.length, 0);
});

test("accept notification failure leaves request pending", async () => {
  const persistence = new FakeFriendshipPersistence();
  const request = await requestFriendship("user-a", "user-b", persistence);
  persistence.failNotification = true;

  await assert.rejects(
    respondToFriendRequest("user-b", request.id, "accept", persistence),
    /notification failed/,
  );

  assert.equal(
    (await persistence.findFriendshipById(request.id))?.status,
    "PENDING",
  );
});

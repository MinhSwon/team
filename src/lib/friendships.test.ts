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

  async transaction<T>(
    operation: (store: FriendshipStore) => Promise<T>,
  ): Promise<T> {
    const snapshot = structuredClone({
      friendships: this.friendships,
      notifications: this.notifications,
      nextId: this.nextId,
    });

    try {
      return await operation(this);
    } catch (error) {
      this.friendships = snapshot.friendships;
      this.notifications = snapshot.notifications;
      this.nextId = snapshot.nextId;
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
    return (
      this.friendships.find((friendship) => friendship.id === id) ?? null
    );
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

  async updateFriendshipStatus(id: string, status: FriendshipStatus) {
    const friendship = await this.findFriendshipById(id);
    if (!friendship) throw { code: "P2025" };

    friendship.status = status;
    friendship.updatedAt = new Date("2026-08-08T00:01:00.000Z");
    return friendship;
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

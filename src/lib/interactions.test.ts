import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  Comment,
  Friendship,
  Notification,
  NotificationType,
  Place,
  Post,
  PostLike,
  UserSavedPlace,
} from "@prisma/client";

import {
  InteractionError,
  createPostComment,
  listNotifications,
  markNotificationsRead,
  resavePost,
  togglePostLike,
  type InteractionPersistence,
  type InteractionStore,
  type NotificationItem,
  type ResaveSource,
} from "./interactions";
import PostCard from "../components/PostCard";
import type { FeedPost, SavePlaceInput } from "./posts";
import { handleNotificationsGet } from "../app/api/notifications/route";
import { handleNotificationsPatch } from "../app/api/notifications/read/route";
import { handleCommentPost } from "../app/api/posts/[id]/comments/route";
import { handleLikePost } from "../app/api/posts/[id]/like/route";
import { handleSavePost } from "../app/api/posts/[id]/save/route";

const createdAt = new Date("2026-08-08T12:00:00.000Z");

type State = {
  friendships: Friendship[];
  likes: PostLike[];
  comments: Comment[];
  notifications: Notification[];
  saves: UserSavedPlace[];
  reshares: Post[];
};

class FakeInteractionPersistence implements InteractionPersistence {
  readonly posts = new Map<string, Post>();
  readonly places = new Map<string, Place>();
  state: State = {
    friendships: [],
    likes: [],
    comments: [],
    notifications: [],
    saves: [],
    reshares: [],
  };
  failNotification = false;
  removeFriendshipOnNextTransaction = false;
  private nextCommentId = 1;
  private nextNotificationId = 1;
  private nextSaveId = 1;
  private nextPostId = 1;
  private competingTransactions = 0;
  private transactionGate: Promise<void> | null = null;
  private releaseTransactions: (() => void) | null = null;
  private competingSaves = 0;
  private saveGate: Promise<void> | null = null;
  private releaseSaves: (() => void) | null = null;

  seedPost(authorId = "user-b", id = "post-1", placeId = "place-1") {
    this.places.set(placeId, {
      id: placeId,
      name: "Cafe Central",
      normalizedName: "cafe central",
      address: "1 Main Street",
      normalizedAddress: "1 main street",
      area: null,
      latitude: null,
      longitude: null,
      externalSource: null,
      externalPlaceId: null,
      dedupeKey: null,
      website: null,
      createdAt,
      updatedAt: createdAt,
    });
    this.posts.set(id, {
      id,
      authorId,
      savedPlaceId: `saved-${id}`,
      sourcePostId: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
  }

  addFriendship(a = "user-a", b = "user-b") {
    this.state.friendships.push({
      id: `friendship-${this.state.friendships.length + 1}`,
      requesterId: a,
      addresseeId: b,
      pairKey: [a, b].sort().join(":"),
      status: "ACCEPTED",
      createdAt,
      updatedAt: createdAt,
    });
  }

  removeFriendship(a = "user-a", b = "user-b") {
    const pairKey = [a, b].sort().join(":");
    this.state.friendships = this.state.friendships.filter(
      (friendship) => friendship.pairKey !== pairKey,
    );
  }

  competeNextTransactions(count = 2) {
    this.competingTransactions = count;
    this.transactionGate = new Promise((resolve) => {
      this.releaseTransactions = resolve;
    });
  }

  competeNextSaves(count = 2) {
    this.competingSaves = count;
    this.saveGate = new Promise((resolve) => {
      this.releaseSaves = resolve;
    });
  }

  async transaction<T>(
    operation: (store: InteractionStore) => Promise<T>,
  ): Promise<T> {
    if (this.removeFriendshipOnNextTransaction) {
      this.removeFriendshipOnNextTransaction = false;
      this.removeFriendship();
    }

    const base = structuredClone(this.state);
    const pending = structuredClone(this.state);
    const result = await operation(this.store(pending));

    if (this.competingTransactions > 0 && this.transactionGate) {
      this.competingTransactions -= 1;
      if (this.competingTransactions === 0) this.releaseTransactions?.();
      await this.transactionGate;
    }

    for (const like of pending.likes) {
      if (
        base.likes.some(
          (item) =>
            item.postId === like.postId && item.userId === like.userId,
        )
      ) {
        continue;
      }
      if (
        this.state.likes.some(
          (item) =>
            item.postId === like.postId && item.userId === like.userId,
        )
      ) {
        throw { code: "P2002" };
      }
    }
    for (const like of base.likes) {
      const removed = !pending.likes.some(
        (item) =>
          item.postId === like.postId && item.userId === like.userId,
      );
      const alreadyRemoved = !this.state.likes.some(
        (item) =>
          item.postId === like.postId && item.userId === like.userId,
      );
      if (removed && alreadyRemoved) throw { code: "P2025" };
    }

    this.state = pending;
    return result;
  }

  private store(state: State): InteractionStore {
    return {
      findPost: async (id) => structuredClone(this.posts.get(id) ?? null),
      findFriendshipByPairKey: async (pairKey) =>
        structuredClone(
          state.friendships.find(
            (friendship) => friendship.pairKey === pairKey,
          ) ?? null,
        ),
      findLike: async (postId, userId) =>
        structuredClone(
          state.likes.find(
            (like) => like.postId === postId && like.userId === userId,
          ) ?? null,
        ),
      createLike: async (postId, userId) => {
        if (
          state.likes.some(
            (like) => like.postId === postId && like.userId === userId,
          )
        ) {
          throw { code: "P2002" };
        }
        state.likes.push({ postId, userId, createdAt });
      },
      deleteLike: async (postId, userId) => {
        state.likes = state.likes.filter(
          (like) => like.postId !== postId || like.userId !== userId,
        );
      },
      countLikes: async (postId) =>
        state.likes.filter((like) => like.postId === postId).length,
      createComment: async (postId, authorId, body) => {
        const comment: Comment = {
          id: `comment-${this.nextCommentId++}`,
          postId,
          authorId,
          body,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        };
        state.comments.push(comment);
        return structuredClone(comment);
      },
      countComments: async (postId) =>
        state.comments.filter(
          (comment) => comment.postId === postId && !comment.deletedAt,
        ).length,
      createNotification: async (input) => {
        if (this.failNotification) throw new Error("notification failed");
        state.notifications.push({
          id: `notification-${this.nextNotificationId++}`,
          recipientId: input.recipientId,
          actorId: input.actorId,
          type: input.type,
          postId: input.postId,
          commentId: input.commentId,
          friendshipId: null,
          readAt: null,
          createdAt: new Date(
            createdAt.getTime() + this.nextNotificationId,
          ),
        });
      },
      markNotificationsRead: async (recipientId, ids, readAt) => {
        let count = 0;
        state.notifications = state.notifications.map((notification) => {
          if (
            notification.recipientId !== recipientId ||
            notification.readAt ||
            (ids && !ids.includes(notification.id))
          ) {
            return notification;
          }
          count += 1;
          return { ...notification, readAt };
        });
        return count;
      },
    };
  }

  async findLike(postId: string, userId: string) {
    return structuredClone(
      this.state.likes.find(
        (like) => like.postId === postId && like.userId === userId,
      ) ?? null,
    );
  }

  async countLikes(postId: string) {
    return this.state.likes.filter((like) => like.postId === postId).length;
  }

  async findResaveSource(
    userId: string,
    postId: string,
  ): Promise<ResaveSource | null> {
    const post = this.posts.get(postId);
    if (!post || post.deletedAt) return null;
    if (post.authorId !== userId) {
      const pairKey = [userId, post.authorId].sort().join(":");
      const friendship = this.state.friendships.find(
        (item) => item.pairKey === pairKey && item.status === "ACCEPTED",
      );
      if (!friendship) return null;
    }
    const place = this.places.get(
      post.id === "post-2" ? "place-2" : "place-1",
    );
    return place
      ? { post: structuredClone(post), place: structuredClone(place) }
      : null;
  }

  async countReshares(postId: string) {
    return this.state.reshares.filter(
      (post) => post.sourcePostId === postId,
    ).length;
  }

  async listNotifications(
    recipientId: string,
    take: number,
  ): Promise<NotificationItem[]> {
    return this.state.notifications
      .filter((notification) => notification.recipientId === recipientId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .slice(0, take)
      .map((notification) => ({
        ...structuredClone(notification),
        actor: {
          id: notification.actorId,
          name: notification.actorId,
          username: notification.actorId,
          image: null,
        },
        post: notification.postId
          ? { id: notification.postId, placeId: "place-1", placeName: "Cafe Central" }
          : null,
        comment: notification.commentId
          ? {
              id: notification.commentId,
              body:
                this.state.comments.find(
                  (comment) => comment.id === notification.commentId,
                )?.body ?? "",
            }
          : null,
      }));
  }

  async saveAndSharePlace(
    userId: string,
    input: SavePlaceInput,
  ) {
    assert.equal(input.place.type, "search");
    assert.equal(input.place.candidate.source, "local");
    assert.ok(input.sourcePostId);
    const placeId = input.place.candidate.id;
    const existing = this.state.saves.find(
      (save) =>
        save.userId === userId &&
        save.placeId === placeId,
    );
    if (existing) {
      const post = this.state.reshares.find(
        (item) => item.savedPlaceId === existing.id,
      );
      assert.ok(post);
      return {
        savedPlace: structuredClone(existing),
        post: structuredClone(post),
      };
    }

    const pendingSave: UserSavedPlace = {
      id: `resaved-${this.nextSaveId++}`,
      userId,
      placeId,
      rating: null,
      review: null,
      tags: [],
      sourcePostId: input.sourcePostId,
      createdAt,
      updatedAt: createdAt,
    };
    const pendingPost: Post = {
      id: `reshare-${this.nextPostId++}`,
      authorId: userId,
      savedPlaceId: pendingSave.id,
      sourcePostId: input.sourcePostId,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };

    if (this.competingSaves > 0 && this.saveGate) {
      this.competingSaves -= 1;
      if (this.competingSaves === 0) this.releaseSaves?.();
      await this.saveGate;
    }

    const winner = this.state.saves.find(
      (save) =>
        save.userId === userId &&
        save.placeId === placeId,
    );
    if (winner) {
      const post = this.state.reshares.find(
        (item) => item.savedPlaceId === winner.id,
      );
      assert.ok(post);
      return {
        savedPlace: structuredClone(winner),
        post: structuredClone(post),
      };
    }

    this.state.saves.push(pendingSave);
    this.state.reshares.push(pendingPost);
    return {
      savedPlace: structuredClone(pendingSave),
      post: structuredClone(pendingPost),
    };
  }
}

function interactionPersistence() {
  const persistence = new FakeInteractionPersistence();
  persistence.seedPost();
  persistence.addFriendship();
  return persistence;
}

test("non-friends receive not-found for likes, comments, and resaves", async () => {
  const persistence = new FakeInteractionPersistence();
  persistence.seedPost();

  for (const operation of [
    () => togglePostLike("user-a", "post-1", true, persistence),
    () =>
      createPostComment("user-a", "post-1", "hello", persistence),
    () =>
      resavePost("user-a", "post-1", {
        persistence,
        saveAndSharePlace: persistence.saveAndSharePlace.bind(persistence),
      }),
  ]) {
    await assert.rejects(
      operation(),
      (error: unknown) =>
        error instanceof InteractionError &&
        error.code === "NOT_FOUND" &&
        error.status === 404,
    );
  }
});

test("visibility is checked inside the like mutation transaction", async () => {
  const persistence = interactionPersistence();
  persistence.removeFriendshipOnNextTransaction = true;

  await assert.rejects(
    togglePostLike("user-a", "post-1", true, persistence),
    (error: unknown) =>
      error instanceof InteractionError && error.code === "NOT_FOUND",
  );

  assert.equal(persistence.state.likes.length, 0);
  assert.equal(persistence.state.notifications.length, 0);
});

test("like desired state is replay-idempotent", async () => {
  const persistence = interactionPersistence();

  assert.deepEqual(
    await togglePostLike("user-a", "post-1", true, persistence),
    { liked: true, count: 1 },
  );
  assert.deepEqual(
    await togglePostLike("user-a", "post-1", true, persistence),
    { liked: true, count: 1 },
  );
  assert.equal(persistence.state.likes.length, 1);
  assert.deepEqual(
    persistence.state.notifications.map((notification) => notification.type),
    ["POST_LIKED"],
  );

  assert.deepEqual(
    await togglePostLike("user-a", "post-1", false, persistence),
    { liked: false, count: 0 },
  );
  assert.deepEqual(
    await togglePostLike("user-a", "post-1", false, persistence),
    { liked: false, count: 0 },
  );
  assert.equal(persistence.state.likes.length, 0);
});

test("concurrent duplicate likes commit one like and one notification", async () => {
  const persistence = interactionPersistence();
  persistence.competeNextTransactions();

  const results = await Promise.all([
    togglePostLike("user-a", "post-1", true, persistence),
    togglePostLike("user-a", "post-1", true, persistence),
  ]);

  assert.deepEqual(results, [
    { liked: true, count: 1 },
    { liked: true, count: 1 },
  ]);
  assert.equal(persistence.state.likes.length, 1);
  assert.equal(persistence.state.notifications.length, 1);
});

test("concurrent duplicate unlikes settle on one removed like", async () => {
  const persistence = interactionPersistence();
  await togglePostLike("user-a", "post-1", true, persistence);
  persistence.competeNextTransactions();

  const results = await Promise.all([
    togglePostLike("user-a", "post-1", false, persistence),
    togglePostLike("user-a", "post-1", false, persistence),
  ]);

  assert.deepEqual(results, [
    { liked: false, count: 0 },
    { liked: false, count: 0 },
  ]);
  assert.equal(persistence.state.likes.length, 0);
});

test("comment trims body, accepts 1000 characters, and rejects empty or 1001", async () => {
  const persistence = interactionPersistence();
  const first = await createPostComment(
    "user-a",
    "post-1",
    "  useful note  ",
    persistence,
  );
  const boundary = await createPostComment(
    "user-a",
    "post-1",
    "x".repeat(1000),
    persistence,
  );

  assert.equal(first.comment.body, "useful note");
  assert.equal(first.count, 1);
  assert.equal(boundary.comment.body.length, 1000);
  assert.equal(boundary.count, 2);

  for (const body of ["   ", "x".repeat(1001), 42]) {
    await assert.rejects(
      createPostComment("user-a", "post-1", body, persistence),
      (error: unknown) =>
        error instanceof InteractionError &&
        error.code === "INVALID_INPUT" &&
        error.status === 400,
    );
  }
});

test("self likes and comments suppress notifications", async () => {
  const persistence = new FakeInteractionPersistence();
  persistence.seedPost("user-a");

  await togglePostLike("user-a", "post-1", true, persistence);
  await createPostComment("user-a", "post-1", "owner note", persistence);

  assert.equal(persistence.state.notifications.length, 0);
});

test("notification failure rolls back interaction mutation", async () => {
  const persistence = interactionPersistence();
  persistence.failNotification = true;

  await assert.rejects(
    togglePostLike("user-a", "post-1", true, persistence),
    /notification failed/,
  );
  await assert.rejects(
    createPostComment("user-a", "post-1", "hello", persistence),
    /notification failed/,
  );

  assert.equal(persistence.state.likes.length, 0);
  assert.equal(persistence.state.comments.length, 0);
  assert.equal(persistence.state.notifications.length, 0);
});

test("resave records source attribution and duplicate saves return existing state", async () => {
  const persistence = interactionPersistence();
  const dependencies = {
    persistence,
    saveAndSharePlace: persistence.saveAndSharePlace.bind(persistence),
  };

  const first = await resavePost("user-a", "post-1", dependencies);
  const second = await resavePost("user-a", "post-1", dependencies);

  assert.equal(first.savedPlace.sourcePostId, "post-1");
  assert.equal(first.post.sourcePostId, "post-1");
  assert.equal(second.savedPlace.id, first.savedPlace.id);
  assert.equal(second.post.id, first.post.id);
  assert.equal(second.saved, true);
  assert.equal(second.count, 1);
  assert.equal(persistence.state.saves.length, 1);
  assert.equal(persistence.state.reshares.length, 1);
});

test("concurrent duplicate resaves create one save and one attributed post", async () => {
  const persistence = interactionPersistence();
  persistence.competeNextSaves();
  const dependencies = {
    persistence,
    saveAndSharePlace: persistence.saveAndSharePlace.bind(persistence),
  };

  const [first, second] = await Promise.all([
    resavePost("user-a", "post-1", dependencies),
    resavePost("user-a", "post-1", dependencies),
  ]);

  assert.equal(first.savedPlace.id, second.savedPlace.id);
  assert.equal(first.post.id, second.post.id);
  assert.equal(persistence.state.saves.length, 1);
  assert.equal(persistence.state.reshares.length, 1);
  assert.equal(persistence.state.reshares[0]?.sourcePostId, "post-1");
});

test("notifications list newest 50 with actor and referenced records", async () => {
  const persistence = interactionPersistence();
  for (let index = 0; index < 55; index += 1) {
    const comment = await createPostComment(
      "user-a",
      "post-1",
      `comment ${index}`,
      persistence,
    );
    assert.equal(comment.count, index + 1);
  }

  const notifications = await listNotifications("user-b", persistence);

  assert.equal(notifications.length, 50);
  assert.equal(notifications[0]?.actor.id, "user-a");
  assert.equal(notifications[0]?.post?.id, "post-1");
  assert.equal(notifications[0]?.comment?.body, "comment 54");
  assert.equal(notifications[49]?.comment?.body, "comment 5");
});

test("notification reads update current recipient records only", async () => {
  const persistence = interactionPersistence();
  await createPostComment("user-a", "post-1", "first", persistence);
  await createPostComment("user-a", "post-1", "second", persistence);
  persistence.state.notifications.push({
    id: "other-user-notification",
    recipientId: "user-c",
    actorId: "user-a",
    type: "POST_COMMENTED" as NotificationType,
    postId: "post-1",
    commentId: null,
    friendshipId: null,
    readAt: null,
    createdAt,
  });
  const ownIds = persistence.state.notifications
    .filter((notification) => notification.recipientId === "user-b")
    .map((notification) => notification.id);

  assert.equal(
    await markNotificationsRead(
      "user-b",
      { ids: [ownIds[0], "other-user-notification"] },
      persistence,
    ),
    1,
  );
  assert.ok(
    persistence.state.notifications.find(
      (notification) => notification.id === ownIds[0],
    )?.readAt,
  );
  assert.equal(
    persistence.state.notifications.find(
      (notification) => notification.id === ownIds[1],
    )?.readAt,
    null,
  );
  assert.equal(
    persistence.state.notifications.find(
      (notification) => notification.id === "other-user-notification",
    )?.readAt,
    null,
  );

  assert.equal(
    await markNotificationsRead("user-b", { all: true }, persistence),
    1,
  );
  assert.ok(
    persistence.state.notifications
      .filter((notification) => notification.recipientId === "user-b")
      .every((notification) => notification.readAt),
  );
});

test("interaction routes derive actor and recipient from server session", async () => {
  const seen: string[] = [];
  const context = { params: Promise.resolve({ id: "post-1" }) };
  const requireUser = async () => ({ id: "session-user" });

  const likeResponse = await handleLikePost(
    new Request("http://localhost/api/posts/post-1/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked: true, userId: "client-user" }),
    }),
    context,
    {
      requireUser,
      togglePostLike: async (userId, postId, liked) => {
        seen.push(`like:${userId}:${postId}:${liked}`);
        return { liked, count: 1 };
      },
    },
  );
  const commentResponse = await handleCommentPost(
    new Request("http://localhost/api/posts/post-1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "hello", userId: "client-user" }),
    }),
    context,
    {
      requireUser,
      createPostComment: async (userId, postId, body) => {
        seen.push(`comment:${userId}:${postId}:${body}`);
        return {
          comment: {
            id: "comment-1",
            postId,
            authorId: userId,
            body: String(body),
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
          },
          count: 1,
        };
      },
    },
  );
  const saveResponse = await handleSavePost(context, {
    requireUser,
    resavePost: async (userId, postId) => {
      seen.push(`save:${userId}:${postId}`);
      return {
        savedPlace: {} as UserSavedPlace,
        post: {} as Post,
        saved: true as const,
        count: 1,
      };
    },
  });
  const listResponse = await handleNotificationsGet({
    requireUser,
    listNotifications: async (userId) => {
      seen.push(`list:${userId}`);
      return [];
    },
  });
  const readResponse = await handleNotificationsPatch(
    new Request("http://localhost/api/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: ["notification-1"],
        recipientId: "client-user",
      }),
    }),
    {
      requireUser,
      markNotificationsRead: async (userId) => {
        seen.push(`read:${userId}`);
        return 1;
      },
    },
  );

  for (const response of [
    likeResponse,
    commentResponse,
    saveResponse,
    listResponse,
    readResponse,
  ]) {
    assert.equal(response.status, 200);
  }
  assert.deepEqual(seen, [
    "like:session-user:post-1:true",
    "comment:session-user:post-1:hello",
    "save:session-user:post-1",
    "list:session-user",
    "read:session-user",
  ]);
});

test("like route rejects missing or non-boolean desired state", async () => {
  const context = { params: Promise.resolve({ id: "post-1" }) };
  const dependencies = {
    requireUser: async () => ({ id: "session-user" }),
    togglePostLike: async () => {
      assert.fail("invalid input must not reach mutation");
    },
  };

  for (const body of [{}, { liked: "true" }, { liked: null }]) {
    const response = await handleLikePost(
      new Request("http://localhost/api/posts/post-1/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      context,
      dependencies,
    );

    assert.equal(response.status, 400, JSON.stringify(body));
  }
});

test("PostCard renders interactive controls and existing inline comments", () => {
  const post = {
    id: "post-1",
    authorId: "user-b",
    savedPlaceId: "saved-post-1",
    sourcePostId: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    author: {
      id: "user-b",
      name: "User B",
      username: "user-b",
      image: null,
    },
    savedPlace: {
      id: "saved-post-1",
      userId: "user-b",
      placeId: "place-1",
      rating: null,
      review: null,
      tags: [],
      sourcePostId: null,
      createdAt,
      updatedAt: createdAt,
      place: {
        id: "place-1",
        name: "Cafe Central",
        normalizedName: "cafe central",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
        area: null,
        latitude: null,
        longitude: null,
        externalSource: null,
        externalPlaceId: null,
        dedupeKey: null,
        website: null,
        createdAt,
        updatedAt: createdAt,
      },
      images: [],
    },
    sourcePost: null,
    counts: { likes: 0, comments: 1, reshares: 0 },
    comments: [
      {
        id: "comment-1",
        body: "Worth the trip",
        createdAt,
        author: {
          id: "user-a",
          name: "User A",
          username: "user-a",
          image: null,
        },
      },
    ],
    likedByCurrentUser: false,
    savedByCurrentUser: false,
  } as FeedPost;

  const markup = renderToStaticMarkup(
    createElement(PostCard, { post }),
  );

  assert.match(markup, /aria-label="Like"/);
  assert.match(markup, /aria-label="Add comment"/);
  assert.match(markup, /aria-label="Save place"/);
  assert.match(markup, /Worth the trip/);
});

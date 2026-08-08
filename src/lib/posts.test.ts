import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type {
  Comment,
  Friendship,
  Place,
  Post,
  SavedPlaceImage,
  User,
  UserSavedPlace,
} from "@prisma/client";

import {
  assertCanViewPost,
  FriendshipError,
  type PostVisibilityStore,
} from "./friendships";
import {
  PostError,
  deleteSavedPlace,
  getFeed,
  getPlaceDetail,
  getPostDetail,
  parseSavePlaceInput,
  saveAndSharePlace,
  updateSavedPlace,
  type FeedPost,
  type FeedQuery,
  type PlaceDetail,
  type NewPost,
  type NewSavedPlace,
  type PostDependencies,
  type PostsPersistence,
  type PostWriteStore,
  type SavedPlaceUpdate,
} from "./posts";

const createdAt = new Date("2026-08-08T12:00:00.000Z");
const trustedBlobHost = "store.public.blob.vercel-storage.com";
process.env.BLOB_PUBLIC_HOST = trustedBlobHost;

function withBlobPublicHost(
  value: string | undefined,
  operation: () => void,
) {
  const previous = process.env.BLOB_PUBLIC_HOST;
  if (value === undefined) delete process.env.BLOB_PUBLIC_HOST;
  else process.env.BLOB_PUBLIC_HOST = value;
  try {
    operation();
  } finally {
    if (previous === undefined) delete process.env.BLOB_PUBLIC_HOST;
    else process.env.BLOB_PUBLIC_HOST = previous;
  }
}

function user(id: string): User {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    username: id,
    bio: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function place(id = "place-1"): Place {
  return {
    id,
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
  };
}

type State = {
  savedPlaces: UserSavedPlace[];
  posts: Post[];
  images: SavedPlaceImage[];
  comments: Comment[];
};

class FakePostsPersistence implements PostsPersistence {
  state: State = { savedPlaces: [], posts: [], images: [], comments: [] };
  friendships: Friendship[] = [];
  users = new Map<string, User>();
  places = new Map<string, Place>();
  failPost = false;
  removeFriendshipOnNextTransaction = false;
  private nextSavedPlaceId = 1;
  private nextPostId = 1;
  private nextImageId = 1;
  private competingTransactions = 0;
  private transactionGate: Promise<void> | null = null;
  private releaseTransactions: (() => void) | null = null;

  addUser(id: string) {
    this.users.set(id, user(id));
  }

  addPlace(nextPlace: Place) {
    this.places.set(nextPlace.id, nextPlace);
  }

  addFriendship(a: string, b: string, status: Friendship["status"]) {
    this.friendships.push({
      id: `friendship-${this.friendships.length + 1}`,
      requesterId: a,
      addresseeId: b,
      pairKey: [a, b].sort().join(":"),
      status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  addComment(
    postId: string,
    id: string,
    deletedAt: Date | null = null,
  ) {
    this.state.comments.push({
      id,
      postId,
      authorId: "user-a",
      body: id,
      createdAt,
      updatedAt: createdAt,
      deletedAt,
    });
    return this.state.comments.filter(
      (comment) => comment.postId === postId && !comment.deletedAt,
    ).length;
  }

  removeFriendship(a: string, b: string) {
    const pairKey = [a, b].sort().join(":");
    this.friendships = this.friendships.filter(
      (friendship) => friendship.pairKey !== pairKey,
    );
  }

  competeNextTransactions(count = 2) {
    this.competingTransactions = count;
    this.transactionGate = new Promise((resolve) => {
      this.releaseTransactions = resolve;
    });
  }

  async transaction<T>(
    operation: (store: PostWriteStore) => Promise<T>,
  ): Promise<T> {
    if (this.removeFriendshipOnNextTransaction) {
      this.removeFriendshipOnNextTransaction = false;
      this.removeFriendship("user-a", "user-b");
    }
    const base = structuredClone(this.state);
    const pending = structuredClone(this.state);
    const store = this.store(pending);
    const result = await operation(store);

    if (this.competingTransactions > 0 && this.transactionGate) {
      this.competingTransactions -= 1;
      if (this.competingTransactions === 0) this.releaseTransactions?.();
      await this.transactionGate;
    }

    for (const savedPlace of pending.savedPlaces) {
      if (base.savedPlaces.some((item) => item.id === savedPlace.id)) continue;
      if (
        this.state.savedPlaces.some(
          (item) =>
            item.userId === savedPlace.userId &&
            item.placeId === savedPlace.placeId,
        )
      ) {
        throw { code: "P2002" };
      }
    }

    this.state = pending;
    return result;
  }

  private store(state: State): PostWriteStore {
    return {
      findPost: async (id) =>
        structuredClone(
          state.posts.find((post) => post.id === id) ?? null,
        ),
      findFriendshipByPairKey: async (pairKey) =>
        structuredClone(
          this.friendships.find(
            (friendship) => friendship.pairKey === pairKey,
          ) ?? null,
        ),
      createSavedPlace: async (input: NewSavedPlace) => {
        if (
          state.savedPlaces.some(
            (item) =>
              item.userId === input.userId &&
              item.placeId === input.placeId,
          )
        ) {
          throw { code: "P2002" };
        }

        const savedPlace: UserSavedPlace = {
          id: `saved-${this.nextSavedPlaceId++}`,
          userId: input.userId,
          placeId: input.placeId,
          rating: input.rating,
          review: input.review,
          tags: input.tags,
          sourcePostId: input.sourcePostId,
          createdAt,
          updatedAt: createdAt,
        };
        state.savedPlaces.push(savedPlace);
        state.images.push(
          ...input.images.map((image, index) => ({
            id: `image-${this.nextImageId++}`,
            savedPlaceId: savedPlace.id,
            url: image.url,
            caption: image.caption,
            sortOrder: index,
          })),
        );
        return structuredClone(savedPlace);
      },
      createPost: async (input: NewPost) => {
        if (this.failPost) throw new Error("post failed");
        const post: Post = {
          id: `post-${this.nextPostId++}`,
          authorId: input.authorId,
          savedPlaceId: input.savedPlaceId,
          sourcePostId: input.sourcePostId,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        };
        state.posts.push(post);
        return structuredClone(post);
      },
      findSavedPlaceById: async (id) =>
        structuredClone(
          state.savedPlaces.find((item) => item.id === id) ?? null,
        ),
      updateSavedPlace: async (id, input: SavedPlaceUpdate) => {
        const index = state.savedPlaces.findIndex((item) => item.id === id);
        if (index < 0) throw { code: "P2025" };
        const current = state.savedPlaces[index];
        const updated = {
          ...current,
          ...input,
          updatedAt: new Date("2026-08-08T12:05:00.000Z"),
        };
        state.savedPlaces[index] = updated;
        if (input.images) {
          state.images = state.images.filter(
            (image) => image.savedPlaceId !== id,
          );
          state.images.push(
            ...input.images.map((image, sortOrder) => ({
              id: `image-${this.nextImageId++}`,
              savedPlaceId: id,
              url: image.url,
              caption: image.caption,
              sortOrder,
            })),
          );
        }
        return structuredClone(updated);
      },
      deleteSavedPlace: async (id) => {
        state.savedPlaces = state.savedPlaces.filter(
          (item) => item.id !== id,
        );
        state.posts = state.posts.filter(
          (item) => item.savedPlaceId !== id,
        );
        state.images = state.images.filter(
          (item) => item.savedPlaceId !== id,
        );
      },
    };
  }

  async findSavedPlaceWithPost(userId: string, placeId: string) {
    const savedPlace = this.state.savedPlaces.find(
      (item) => item.userId === userId && item.placeId === placeId,
    );
    if (!savedPlace) return null;
    const post = this.state.posts.find(
      (item) => item.savedPlaceId === savedPlace.id,
    );
    return post
      ? {
          savedPlace: structuredClone(savedPlace),
          post: structuredClone(post),
        }
      : null;
  }

  async findSavedPlaceById(id: string) {
    return structuredClone(
      this.state.savedPlaces.find((item) => item.id === id) ?? null,
    );
  }

  async findFeedPosts(query: FeedQuery): Promise<FeedPost[]> {
    const visibleAuthors = new Set([query.userId]);
    for (const friendship of this.friendships) {
      if (friendship.status !== "ACCEPTED") continue;
      if (friendship.requesterId === query.userId) {
        visibleAuthors.add(friendship.addresseeId);
      }
      if (friendship.addresseeId === query.userId) {
        visibleAuthors.add(friendship.requesterId);
      }
    }

    return this.state.posts
      .filter(
        (post) => !post.deletedAt && visibleAuthors.has(post.authorId),
      )
      .filter(
        (post) =>
          !query.cursor ||
          post.createdAt < query.cursor.createdAt ||
          (post.createdAt.getTime() === query.cursor.createdAt.getTime() &&
            post.id < query.cursor.id),
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .slice(0, query.take)
      .map((post) => this.feedPost(post, query.userId));
  }

  async findPostDetail(
    userId: string,
    postId: string,
  ): Promise<FeedPost | null> {
    const post = this.state.posts.find(
      (item) => item.id === postId && !item.deletedAt,
    );
    if (!post) return null;

    const visibleAuthors = new Set([userId]);
    for (const friendship of this.friendships) {
      if (friendship.status !== "ACCEPTED") continue;
      if (friendship.requesterId === userId) {
        visibleAuthors.add(friendship.addresseeId);
      }
      if (friendship.addresseeId === userId) {
        visibleAuthors.add(friendship.requesterId);
      }
    }

    return visibleAuthors.has(post.authorId)
      ? this.feedPost(post, userId)
      : null;
  }

  async assertCanViewPost(userId: string, postId: string): Promise<void> {
    const post = this.state.posts.find(
      (item) => item.id === postId && !item.deletedAt,
    );
    if (!post) throw new PostError("Post not found", "NOT_FOUND", 404);
    if (post.authorId === userId) return;
    const friendship = this.friendships.find(
      (item) =>
        item.status === "ACCEPTED" &&
        ((item.requesterId === userId &&
          item.addresseeId === post.authorId) ||
          (item.addresseeId === userId &&
            item.requesterId === post.authorId)),
    );
    if (!friendship) {
      throw new PostError("Post not found", "NOT_FOUND", 404);
    }
  }

  async findPlaceDetail(
    userId: string,
    placeId: string,
  ): Promise<PlaceDetail | null> {
    const canonicalPlace = this.places.get(placeId);
    if (!canonicalPlace) return null;
    const visibleUsers = new Set([userId]);
    for (const friendship of this.friendships) {
      if (friendship.status !== "ACCEPTED") continue;
      if (friendship.requesterId === userId) {
        visibleUsers.add(friendship.addresseeId);
      }
      if (friendship.addresseeId === userId) {
        visibleUsers.add(friendship.requesterId);
      }
    }
    const saves = this.state.savedPlaces.filter(
      (savedPlace) =>
        savedPlace.placeId === placeId &&
        visibleUsers.has(savedPlace.userId),
    );

    return {
      place: structuredClone(canonicalPlace),
      currentUserSave: structuredClone(
        saves.find((savedPlace) => savedPlace.userId === userId) ?? null,
      ),
      reviews: saves
        .filter((savedPlace) => savedPlace.userId !== userId)
        .map((savedPlace) => ({
          ...structuredClone(savedPlace),
          user: {
            id: savedPlace.userId,
            name: this.users.get(savedPlace.userId)?.name ?? savedPlace.userId,
            username:
              this.users.get(savedPlace.userId)?.username ??
              savedPlace.userId,
            image: this.users.get(savedPlace.userId)?.image ?? null,
          },
          images: [],
        })),
    };
  }

  private feedPost(post: Post, viewerId: string): FeedPost {
    const savedPlace = this.state.savedPlaces.find(
      (item) => item.id === post.savedPlaceId,
    );
    assert.ok(savedPlace);
    const canonicalPlace = this.places.get(savedPlace.placeId);
    assert.ok(canonicalPlace);
    const author = this.users.get(post.authorId);
    assert.ok(author);
    const comments = this.state.comments
      .filter((comment) => comment.postId === post.id && !comment.deletedAt)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 3)
      .reverse();

    return {
      ...structuredClone(post),
      author: {
        id: author.id,
        name: author.name,
        username: author.username,
        image: author.image,
      },
      savedPlace: {
        ...structuredClone(savedPlace),
        place: structuredClone(canonicalPlace),
        images: structuredClone(
          this.state.images
            .filter((image) => image.savedPlaceId === savedPlace.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .slice(0, 1),
        ),
      },
      sourcePost: null,
      counts: {
        likes: 0,
        comments: this.state.comments.filter(
          (comment) => comment.postId === post.id && !comment.deletedAt,
        ).length,
        reshares: this.state.posts.filter(
          (candidate) =>
            candidate.sourcePostId === post.id && !candidate.deletedAt,
        ).length,
      },
      comments: comments.map((comment) => {
        const commentAuthor = this.users.get(comment.authorId);
        assert.ok(commentAuthor);
        return {
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          author: {
            id: commentAuthor.id,
            name: commentAuthor.name,
            username: commentAuthor.username,
            image: commentAuthor.image,
          },
        };
      }),
      likedByCurrentUser: false,
      savedByCurrentUser: this.state.savedPlaces.some(
        (item) =>
          item.userId === viewerId && item.placeId === savedPlace.placeId,
      ),
    };
  }

  seedPost(
    authorId: string,
    id: string,
    timestamp: Date,
    placeId = `place-${id}`,
  ) {
    this.addUser(authorId);
    this.addPlace(place(placeId));
    const savedPlace: UserSavedPlace = {
      id: `saved-${id}`,
      userId: authorId,
      placeId,
      rating: null,
      review: null,
      tags: [],
      sourcePostId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.state.savedPlaces.push(savedPlace);
    this.state.posts.push({
      id,
      authorId,
      savedPlaceId: savedPlace.id,
      sourcePostId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
  }
}

function dependencies(
  persistence: FakePostsPersistence,
  resolvedPlace = place(),
  overrides: Partial<PostDependencies> = {},
): PostDependencies {
  persistence.addUser("user-a");
  persistence.addPlace(resolvedPlace);
  return {
    persistence,
    resolvePlace: async () => resolvedPlace,
    assertCanViewPost: async (_userId, postId) => {
      const post = persistence.state.posts.find((item) => item.id === postId);
      if (!post) throw new PostError("Post not found", "NOT_FOUND", 404);
      return post;
    },
    ...overrides,
  };
}

const saveInput = {
  place: {
    type: "manual" as const,
    name: "Cafe Central",
    address: "1 Main Street",
  },
  rating: 5,
  review: "Excellent coffee.",
  tags: ["coffee", "quiet"],
  images: [
    {
      url: "https://store.public.blob.vercel-storage.com/cafe.webp",
      caption: null,
    },
  ],
};

test("one new save creates exactly one post in one transaction", async () => {
  const persistence = new FakePostsPersistence();
  const result = await saveAndSharePlace(
    "user-a",
    saveInput,
    dependencies(persistence),
  );

  assert.equal(persistence.state.savedPlaces.length, 1);
  assert.equal(persistence.state.posts.length, 1);
  assert.equal(result.post.savedPlaceId, result.savedPlace.id);
  assert.equal(persistence.state.images.length, 1);
});

test("repeated save returns existing save and post", async () => {
  const persistence = new FakePostsPersistence();
  const deps = dependencies(persistence);

  const first = await saveAndSharePlace("user-a", saveInput, deps);
  const second = await saveAndSharePlace("user-a", saveInput, deps);

  assert.equal(second.savedPlace.id, first.savedPlace.id);
  assert.equal(second.post.id, first.post.id);
  assert.equal(persistence.state.savedPlaces.length, 1);
  assert.equal(persistence.state.posts.length, 1);
});

test("concurrent saves commit one save and one post", async () => {
  const persistence = new FakePostsPersistence();
  const deps = dependencies(persistence);
  persistence.competeNextTransactions();

  const [first, second] = await Promise.all([
    saveAndSharePlace("user-a", saveInput, deps),
    saveAndSharePlace("user-a", saveInput, deps),
  ]);

  assert.equal(first.savedPlace.id, second.savedPlace.id);
  assert.equal(first.post.id, second.post.id);
  assert.equal(persistence.state.savedPlaces.length, 1);
  assert.equal(persistence.state.posts.length, 1);
});

test("reshare keeps authorized source post attribution", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-b", "source-post", createdAt, "place-1");
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");

  const result = await saveAndSharePlace(
    "user-a",
    { ...saveInput, sourcePostId: "source-post" },
    dependencies(persistence),
  );

  assert.equal(result.savedPlace.sourcePostId, "source-post");
  assert.equal(result.post.sourcePostId, "source-post");
});

test("reshare rechecks friendship inside the save transaction", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-b", "source-post", createdAt, "place-1");
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  persistence.removeFriendshipOnNextTransaction = true;

  await assert.rejects(
    saveAndSharePlace(
      "user-a",
      { ...saveInput, sourcePostId: "source-post" },
      dependencies(persistence, place(), {
        assertCanViewPost: (
          userId: string,
          postId: string,
          store?: PostVisibilityStore,
        ) => assertCanViewPost(userId, postId, store),
      }),
    ),
    (error: unknown) =>
      error instanceof FriendshipError &&
      error.code === "NOT_FOUND" &&
      error.status === 404 &&
      error.message === "Post not found",
  );

  assert.equal(
    persistence.state.savedPlaces.filter(
      (savedPlace) => savedPlace.userId === "user-a",
    ).length,
    0,
  );
  assert.equal(
    persistence.state.posts.filter((post) => post.authorId === "user-a")
      .length,
    0,
  );
});

test("saved-place update edits content without creating another post", async () => {
  const persistence = new FakePostsPersistence();
  const deps = dependencies(persistence);
  const created = await saveAndSharePlace("user-a", saveInput, deps);

  const updated = await updateSavedPlace(
    "user-a",
    created.savedPlace.id,
    {
      rating: 4,
      review: "Updated review.",
      tags: ["updated"],
      images: [],
    },
    persistence,
  );

  assert.equal(updated.rating, 4);
  assert.equal(updated.review, "Updated review.");
  assert.deepEqual(updated.tags, ["updated"]);
  assert.equal(persistence.state.images.length, 0);
  assert.equal(persistence.state.posts.length, 1);
  assert.equal(persistence.state.posts[0]?.id, created.post.id);
});

test("post creation failure rolls back saved place and images", async () => {
  const persistence = new FakePostsPersistence();
  persistence.failPost = true;

  await assert.rejects(
    saveAndSharePlace("user-a", saveInput, dependencies(persistence)),
    /post failed/,
  );

  assert.equal(persistence.state.savedPlaces.length, 0);
  assert.equal(persistence.state.posts.length, 0);
  assert.equal(persistence.state.images.length, 0);
});

test("unrelated Prisma unique errors are not swallowed", async () => {
  const persistence = new FakePostsPersistence();
  persistence.failPost = true;
  const originalTransaction = persistence.transaction.bind(persistence);
  persistence.transaction = async (operation) => {
    try {
      return await originalTransaction(operation);
    } catch (error) {
      if (error instanceof Error && error.message === "post failed") {
        throw { code: "P2002", meta: { target: ["unrelated"] } };
      }
      throw error;
    }
  };

  await assert.rejects(
    saveAndSharePlace("user-a", saveInput, dependencies(persistence)),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002",
  );
});

test("feed includes self and accepted friends only, then excludes removed friends", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-a", "self", createdAt);
  persistence.seedPost("user-b", "accepted", createdAt);
  persistence.seedPost("user-c", "pending", createdAt);
  persistence.seedPost("user-d", "stranger", createdAt);
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  persistence.addFriendship("user-c", "user-a", "PENDING");

  assert.deepEqual(
    (await getFeed("user-a", undefined, undefined, persistence)).items.map(
      (post) => post.id,
    ),
    ["self", "accepted"],
  );

  persistence.removeFriendship("user-a", "user-b");

  assert.deepEqual(
    (await getFeed("user-a", undefined, undefined, persistence)).items.map(
      (post) => post.id,
    ),
    ["self"],
  );
});

test("feed cursor is stable for equal timestamps", async () => {
  const persistence = new FakePostsPersistence();
  for (const id of ["post-a", "post-c", "post-b"]) {
    persistence.seedPost("user-a", id, createdAt);
  }

  const first = await getFeed("user-a", undefined, 2, persistence);
  const second = await getFeed(
    "user-a",
    first.nextCursor ?? undefined,
    2,
    persistence,
  );

  assert.deepEqual(
    first.items.map((post) => post.id),
    ["post-c", "post-b"],
  );
  assert.ok(first.nextCursor);
  assert.deepEqual(
    second.items.map((post) => post.id),
    ["post-a"],
  );
  assert.equal(second.nextCursor, null);
});

test("feed and post counts stay aligned after comment mutation", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-b", "source-post", createdAt);
  persistence.addUser("user-a");
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  persistence.seedPost("user-a", "active-reshare", createdAt);
  persistence.seedPost("user-a", "deleted-reshare", createdAt);
  const activeReshare = persistence.state.posts.find(
    (post) => post.id === "active-reshare",
  );
  const deletedReshare = persistence.state.posts.find(
    (post) => post.id === "deleted-reshare",
  );
  assert.ok(activeReshare);
  assert.ok(deletedReshare);
  activeReshare.sourcePostId = "source-post";
  deletedReshare.sourcePostId = "source-post";
  deletedReshare.deletedAt = createdAt;

  assert.equal(persistence.addComment("source-post", "comment-1"), 1);
  assert.equal(
    persistence.addComment("source-post", "comment-deleted", createdAt),
    1,
  );

  const initialFeed = await getFeed(
    "user-a",
    undefined,
    undefined,
    persistence,
  );
  const initialPost = initialFeed.items.find(
    (post) => post.id === "source-post",
  );
  assert.deepEqual(initialPost?.counts, {
    likes: 0,
    comments: 1,
    reshares: 1,
  });
  assert.deepEqual(
    initialPost?.comments.map((comment) => comment.id),
    ["comment-1"],
  );

  const mutationCount = persistence.addComment(
    "source-post",
    "comment-2",
  );
  const refreshedFeed = await getFeed(
    "user-a",
    undefined,
    undefined,
    persistence,
  );
  const refreshedPost = await getPostDetail(
    "user-a",
    "source-post",
    persistence,
  );

  assert.equal(mutationCount, 2);
  assert.equal(
    refreshedFeed.items.find((post) => post.id === "source-post")?.counts
      .comments,
    mutationCount,
  );
  assert.deepEqual(refreshedPost.counts, {
    likes: 0,
    comments: mutationCount,
    reshares: 1,
  });
});

test("place detail includes only current user and accepted-friend reviews", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-a", "self", createdAt, "shared-place");
  persistence.seedPost("user-b", "friend", createdAt, "shared-place");
  persistence.seedPost("user-c", "pending", createdAt, "shared-place");
  persistence.seedPost("user-d", "stranger", createdAt, "shared-place");
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  persistence.addFriendship("user-a", "user-c", "PENDING");

  const detail = await getPlaceDetail(
    "user-a",
    "shared-place",
    persistence,
  );

  assert.equal(detail.currentUserSave?.userId, "user-a");
  assert.deepEqual(
    detail.reviews.map((review) => review.userId),
    ["user-b"],
  );
});

test("post detail allows owner and accepted friends, then excludes removed friends", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-a", "owner-post", createdAt);
  persistence.seedPost("user-b", "friend-post", createdAt);
  persistence.seedPost("user-c", "pending-post", createdAt);
  persistence.seedPost("user-d", "stranger-post", createdAt);
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  persistence.addFriendship("user-a", "user-c", "PENDING");

  assert.equal(
    (await getPostDetail("user-a", "owner-post", persistence)).id,
    "owner-post",
  );
  assert.equal(
    (await getPostDetail("user-a", "friend-post", persistence)).id,
    "friend-post",
  );
  for (const postId of ["pending-post", "stranger-post"]) {
    await assert.rejects(
      getPostDetail("user-a", postId, persistence),
      (error: unknown) =>
        error instanceof PostError &&
        error.code === "NOT_FOUND" &&
        error.status === 404 &&
        error.message === "Post not found",
      postId,
    );
  }
  await assert.rejects(
    getPostDetail("user-a", "missing-post", persistence),
    (error: unknown) =>
      error instanceof PostError && error.code === "NOT_FOUND",
  );

  persistence.removeFriendship("user-a", "user-b");

  await assert.rejects(
    getPostDetail("user-a", "friend-post", persistence),
    (error: unknown) =>
      error instanceof PostError &&
      error.code === "NOT_FOUND" &&
      error.status === 404 &&
      error.message === "Post not found",
  );
});

test("delete saved place rejects non-author without changing state", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-a", "post-1", createdAt, "place-1");
  persistence.state.images.push({
    id: "image-1",
    savedPlaceId: "saved-post-1",
    url: "https://store.public.blob.vercel-storage.com/cafe.webp",
    caption: null,
    sortOrder: 0,
  });
  const before = structuredClone(persistence.state);

  await assert.rejects(
    deleteSavedPlace("user-b", "saved-post-1", persistence),
    (error: unknown) =>
      error instanceof PostError && error.code === "FORBIDDEN",
  );
  assert.deepEqual(persistence.state, before);
});

test("delete saved place by author cascades post and images", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-a", "post-1", createdAt, "place-1");
  persistence.state.images.push({
    id: "image-1",
    savedPlaceId: "saved-post-1",
    url: "https://store.public.blob.vercel-storage.com/cafe.webp",
    caption: null,
    sortOrder: 0,
  });

  await deleteSavedPlace("user-a", "saved-post-1", persistence);

  assert.deepEqual(persistence.state, {
    savedPlaces: [],
    posts: [],
    images: [],
    comments: [],
  });
});

test("save payload keeps Task 4 rating and review limits", () => {
  assert.doesNotThrow(() =>
    parseSavePlaceInput({
      ...saveInput,
      review: "r".repeat(2000),
    }),
  );
  assert.throws(
    () =>
      parseSavePlaceInput({
        ...saveInput,
        review: "r".repeat(2001),
      }),
    PostError,
  );
  assert.throws(
    () => parseSavePlaceInput({ ...saveInput, rating: 6 }),
    PostError,
  );
});

test("save payload accepts no images without Blob host configuration", () => {
  withBlobPublicHost(undefined, () => {
    assert.deepEqual(
      parseSavePlaceInput({
        ...saveInput,
        images: [],
      }).images,
      [],
    );
  });
});

test("save payload rejects images when Blob host configuration is missing or invalid", () => {
  for (const configuredHost of [
    undefined,
    "https://store.public.blob.vercel-storage.com",
    "%",
  ]) {
    withBlobPublicHost(configuredHost, () => {
      assert.throws(
        () => parseSavePlaceInput(saveInput),
        (error: unknown) =>
          error instanceof PostError &&
          error.code === "IMAGE_UPLOADS_NOT_CONFIGURED" &&
          error.status === 503 &&
          error.message === "Image uploads are not configured",
      );
    });
  }
});

test("save payload accepts only the configured exact Blob host", () => {
  withBlobPublicHost(trustedBlobHost, () => {
    const trusted =
      `https://${trustedBlobHost}/places/user-a/cafe.webp`;
    assert.equal(
      parseSavePlaceInput({
        ...saveInput,
        images: [{ url: trusted, caption: null }],
      }).images[0]?.url,
      trusted,
    );
    assert.throws(
      () =>
        parseSavePlaceInput({
          ...saveInput,
          images: [
            {
              url: "https://other.public.blob.vercel-storage.com/cafe.jpg",
            },
          ],
        }),
      PostError,
    );
  });
});

test("save payload keeps HTTPS image path constraints", () => {
  for (const url of [
    `http://${trustedBlobHost}/cafe.webp`,
    "https://tracker.example/cafe.webp",
    `https://${trustedBlobHost}.evil.test/cafe.webp`,
    `https://${trustedBlobHost}/cafe.svg`,
    `https://${trustedBlobHost}/cafe.webp?user=tracked`,
    `https://${trustedBlobHost}/cafe.webp#tracked`,
  ]) {
    assert.throws(
      () =>
        parseSavePlaceInput({
          ...saveInput,
          images: [{ url }],
        }),
      PostError,
      url,
    );
  }
});

test("Task 5 pages stay protected and Add submits to saved API", () => {
  const app = new URL("../app/(app)/", import.meta.url);
  const unprotected = new URL("../app/", import.meta.url);

  for (const path of [
    "feed/page.tsx",
    "saved/page.tsx",
    "places/[id]/page.tsx",
  ]) {
    assert.equal(existsSync(new URL(path, app)), true, path);
    assert.equal(existsSync(new URL(path, unprotected)), false, path);
  }

  const addPlace = readFileSync(
    new URL("../components/AddPlaceModal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(addPlace, /["']\/api\/saved["']/);
  assert.doesNotMatch(addPlace, /Save endpoint arrives in Task 5/);
});

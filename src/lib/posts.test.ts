import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type {
  BlobUpload,
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
  blobs: BlobUpload[];
  savedPlaces: UserSavedPlace[];
  posts: Post[];
  images: SavedPlaceImage[];
  comments: Comment[];
};

class FakePostsPersistence implements PostsPersistence {
  state: State = {
    blobs: [],
    savedPlaces: [],
    posts: [],
    images: [],
    comments: [],
  };
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

  addBlob(
    ownerId: string,
    id: string,
    lifecycle: BlobUpload["lifecycle"] = "UPLOADED",
  ) {
    this.state.blobs.push({
      id,
      ownerId,
      url: `https://blob.example/${id}.webp`,
      sourceUrl: null,
      pathname: `places/${ownerId}/${id}.webp`,
      lifecycle,
      leaseUntil: null,
      deleteAttempts: 0,
      lastError: null,
      createdAt,
      updatedAt: createdAt,
    });
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
    for (const blob of pending.blobs) {
      const previous = base.blobs.find((item) => item.id === blob.id);
      const current = this.state.blobs.find((item) => item.id === blob.id);
      if (
        previous?.lifecycle === "UPLOADED" &&
        blob.lifecycle === "CLAIMED" &&
        current?.lifecycle !== "UPLOADED"
      ) {
        throw { code: "P2034" };
      }
    }

    this.state = pending;
    return result;
  }

  private claimImages(
    state: State,
    userId: string,
    images: NewSavedPlace["images"],
  ) {
    return images.map((image) => {
      const blob = state.blobs.find(
        (item) =>
          item.id === image.uploadId &&
          item.ownerId === userId &&
          item.lifecycle === "UPLOADED",
      );
      if (!blob) {
        throw new PostError("Invalid image upload", "INVALID_INPUT", 400);
      }
      assert.ok(blob.url);
      blob.lifecycle = "CLAIMED";
      return {
        blobUploadId: blob.id,
        url: blob.url,
        caption: image.caption,
      };
    });
  }

  private markImagesPending(state: State, savedPlaceId: string) {
    for (const image of state.images) {
      if (image.savedPlaceId !== savedPlaceId || !image.blobUploadId) continue;
      const blob = state.blobs.find((item) => item.id === image.blobUploadId);
      if (blob) blob.lifecycle = "PENDING_DELETE";
    }
  }

  private store(state: State): PostWriteStore {
    return {
      findVisiblePost: async (viewerId, id) => {
        const post = state.posts.find((item) => item.id === id);
        if (!post || post.deletedAt) return null;
        if (post.authorId === viewerId) return structuredClone(post);
        const pairKey = [viewerId, post.authorId].sort().join(":");
        const friendship = this.friendships.find(
          (item) => item.pairKey === pairKey,
        );
        return friendship?.status === "ACCEPTED"
          ? structuredClone(post)
          : null;
      },
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

        const claimedImages = this.claimImages(
          state,
          input.userId,
          input.images,
        );
        const savedPlace: UserSavedPlace = {
          id: `saved-${this.nextSavedPlaceId++}`,
          userId: input.userId,
          placeId: input.placeId,
          rating: input.rating,
          review: input.review,
          tags: input.tags,
          sourcePostId: input.sourcePostId,
          status: input.status,
          createdAt,
          updatedAt: createdAt,
        };
        state.savedPlaces.push(savedPlace);
        state.images.push(
          ...claimedImages.map((image, index) => ({
            id: `image-${this.nextImageId++}`,
            savedPlaceId: savedPlace.id,
            blobUploadId: image.blobUploadId,
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
      findOwnedSavedPlace: async (id, userId) => {
        const savedPlace = state.savedPlaces.find(
          (item) => item.id === id && item.userId === userId,
        );
        if (!savedPlace) return null;
        return {
          ...structuredClone(savedPlace),
          images: structuredClone(
            state.images
              .filter((image) => image.savedPlaceId === id)
              .map(({ blobUploadId }) => ({ blobUploadId })),
          ),
        };
      },
      updateSavedPlace: async (id, userId, input: SavedPlaceUpdate) => {
        const index = state.savedPlaces.findIndex(
          (item) => item.id === id && item.userId === userId,
        );
        if (index < 0) throw { code: "P2025" };
        const current = state.savedPlaces[index];
        const updated = {
          ...current,
          ...input,
          updatedAt: new Date("2026-08-08T12:05:00.000Z"),
        };
        state.savedPlaces[index] = updated;
        if (input.images) {
          this.markImagesPending(state, id);
          state.images = state.images.filter(
            (image) => image.savedPlaceId !== id,
          );
          const claimedImages = this.claimImages(
            state,
            userId,
            input.images,
          );
          state.images.push(
            ...claimedImages.map((image, sortOrder) => ({
              id: `image-${this.nextImageId++}`,
              savedPlaceId: id,
              blobUploadId: image.blobUploadId,
              url: image.url,
              caption: image.caption,
              sortOrder,
            })),
          );
        }
        return structuredClone(updated);
      },
      deleteSavedPlace: async (id, userId) => {
        if (
          !state.savedPlaces.some(
            (item) => item.id === id && item.userId === userId,
          )
        ) {
          throw { code: "P2025" };
        }
        this.markImagesPending(state, id);
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
    const providerBacked =
      canonicalPlace.externalSource !== null &&
      canonicalPlace.externalPlaceId !== null;
    if (!providerBacked && saves.length === 0) return null;

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
      status: "SAVED",
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
  images: [],
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
  assert.equal(persistence.state.images.length, 0);
});

test("save claims only an unclaimed upload owned by current user", async () => {
  const persistence = new FakePostsPersistence();
  persistence.addBlob("user-a", "upload-1");

  await saveAndSharePlace(
    "user-a",
    {
      ...saveInput,
      images: [{ uploadId: "upload-1", caption: "Front room" }],
    },
    dependencies(persistence),
  );

  assert.equal(persistence.state.blobs[0]?.lifecycle, "CLAIMED");
  assert.deepEqual(
    persistence.state.images.map(({ blobUploadId, url, caption }) => ({
      blobUploadId,
      url,
      caption,
    })),
    [
      {
        blobUploadId: "upload-1",
        url: "https://blob.example/upload-1.webp",
        caption: "Front room",
      },
    ],
  );
});

test("save rejects another user's or already claimed upload without side effects", async () => {
  for (const [ownerId, lifecycle] of [
    ["user-b", "UPLOADED"],
    ["user-a", "CLAIMED"],
  ] as const) {
    const persistence = new FakePostsPersistence();
    persistence.addBlob(ownerId, "upload-1", lifecycle);
    const before = structuredClone(persistence.state);

    await assert.rejects(
      saveAndSharePlace(
        "user-a",
        {
          ...saveInput,
          images: [{ uploadId: "upload-1", caption: null }],
        },
        dependencies(persistence),
      ),
      (error: unknown) =>
        error instanceof PostError &&
        error.code === "INVALID_INPUT" &&
        error.status === 400,
    );
    assert.deepEqual(persistence.state, before);
  }
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
  persistence.addBlob("user-a", "upload-old");
  persistence.addBlob("user-a", "upload-new");
  const deps = dependencies(persistence);
  const created = await saveAndSharePlace(
    "user-a",
    {
      ...saveInput,
      images: [{ uploadId: "upload-old", caption: null }],
    },
    deps,
  );

  const updated = await updateSavedPlace(
    "user-a",
    created.savedPlace.id,
    {
      rating: 4,
      review: "Updated review.",
      tags: ["updated"],
      status: "VISITED",
      images: [{ uploadId: "upload-new", caption: "Patio" }],
    },
    persistence,
  );

  assert.equal(updated.rating, 4);
  assert.equal(updated.review, "Updated review.");
  assert.deepEqual(updated.tags, ["updated"]);
  assert.equal(updated.status, "VISITED");
  assert.deepEqual(
    persistence.state.blobs.map(({ id, lifecycle }) => ({ id, lifecycle })),
    [
      { id: "upload-old", lifecycle: "PENDING_DELETE" },
      { id: "upload-new", lifecycle: "CLAIMED" },
    ],
  );
  assert.deepEqual(
    persistence.state.images.map(({ blobUploadId, caption }) => ({
      blobUploadId,
      caption,
    })),
    [{ blobUploadId: "upload-new", caption: "Patio" }],
  );
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

test("manual place detail is opaque outside saver and accepted-friend access", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-b", "manual-post", createdAt, "manual-place");

  assert.equal(
    (await getPlaceDetail("user-b", "manual-place", persistence)).place.id,
    "manual-place",
  );

  for (const [viewerId, friendshipStatus] of [
    ["user-a", "PENDING"],
    ["user-c", null],
  ] as const) {
    if (friendshipStatus) {
      persistence.addFriendship(viewerId, "user-b", friendshipStatus);
    }
    await assert.rejects(
      getPlaceDetail(viewerId, "manual-place", persistence),
      (error: unknown) =>
        error instanceof PostError &&
        error.code === "NOT_FOUND" &&
        error.status === 404 &&
        error.message === "Place not found",
    );
  }

  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  assert.equal(
    (await getPlaceDetail("user-a", "manual-place", persistence)).place.id,
    "manual-place",
  );
  persistence.removeFriendship("user-a", "user-b");
  await assert.rejects(
    getPlaceDetail("user-a", "manual-place", persistence),
    (error: unknown) =>
      error instanceof PostError &&
      error.code === "NOT_FOUND" &&
      error.status === 404,
  );
});

test("verified provider-backed place detail remains globally readable", async () => {
  const persistence = new FakePostsPersistence();
  persistence.addPlace({
    ...place("verified-place"),
    externalSource: "google",
    externalPlaceId: "google-1",
  });

  const detail = await getPlaceDetail(
    "stranger",
    "verified-place",
    persistence,
  );

  assert.equal(detail.place.id, "verified-place");
  assert.equal(detail.currentUserSave, null);
  assert.deepEqual(detail.reviews, []);
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

test("post detail returns not-found when friendship disappears before detail query", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-b", "raced-post", createdAt);
  persistence.addFriendship("user-a", "user-b", "ACCEPTED");
  const findPostDetail = persistence.findPostDetail.bind(persistence);

  persistence.findPostDetail = async (userId, postId) => {
    persistence.removeFriendship("user-a", "user-b");
    return findPostDetail(userId, postId);
  };

  await assert.rejects(
    getPostDetail("user-a", "raced-post", persistence),
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
  persistence.addBlob("user-a", "upload-1", "CLAIMED");
  persistence.state.images.push({
    id: "image-1",
    savedPlaceId: "saved-post-1",
    blobUploadId: "upload-1",
    url: "https://blob.example/upload-1.webp",
    caption: null,
    sortOrder: 0,
  });
  const before = structuredClone(persistence.state);

  await assert.rejects(
    deleteSavedPlace("user-b", "saved-post-1", persistence),
    (error: unknown) =>
      error instanceof PostError &&
      error.code === "NOT_FOUND" &&
      error.status === 404 &&
      error.message === "Saved place not found",
  );
  assert.deepEqual(persistence.state, before);
});

test("delete saved place by author cascades post and images", async () => {
  const persistence = new FakePostsPersistence();
  persistence.seedPost("user-a", "post-1", createdAt, "place-1");
  persistence.addBlob("user-a", "upload-1", "CLAIMED");
  persistence.state.images.push({
    id: "image-1",
    savedPlaceId: "saved-post-1",
    blobUploadId: "upload-1",
    url: "https://blob.example/upload-1.webp",
    caption: null,
    sortOrder: 0,
  });

  await deleteSavedPlace("user-a", "saved-post-1", persistence);

  assert.deepEqual(persistence.state, {
    blobs: [
      {
        id: "upload-1",
        ownerId: "user-a",
        url: "https://blob.example/upload-1.webp",
        sourceUrl: null,
        pathname: "places/user-a/upload-1.webp",
        lifecycle: "PENDING_DELETE",
        leaseUntil: null,
        deleteAttempts: 0,
        lastError: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
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

test("save payload accepts upload IDs and rejects client-supplied Blob URLs", () => {
  const parsed = parseSavePlaceInput({
    ...saveInput,
    images: [{ uploadId: "upload-1", caption: "Front room" }],
  });

  assert.deepEqual(parsed.images, [
    { uploadId: "upload-1", caption: "Front room" },
  ]);
  assert.throws(
    () =>
      parseSavePlaceInput({
        ...saveInput,
        images: [
          {
            url: "https://store.public.blob.vercel-storage.com/forged.webp",
            caption: null,
          },
        ],
      }),
    PostError,
  );
});

test("save payload rejects duplicate upload IDs", () => {
  assert.throws(
    () =>
      parseSavePlaceInput({
        ...saveInput,
        images: [
          { uploadId: "upload-1", caption: null },
          { uploadId: "upload-1", caption: null },
        ],
      }),
    PostError,
  );
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

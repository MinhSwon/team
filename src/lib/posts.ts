import type {
  Place,
  Post,
  Prisma,
  SavedPlaceImage,
  SavedPlaceStatus,
  UserSavedPlace,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanViewPost,
  type PostVisibilityStore,
} from "@/lib/friendships";
import {
  parsePlaceInput,
  resolvePlace,
  type PlaceInput,
} from "@/lib/places";
import { mediaUrl } from "@/lib/media";
import {
  ValidationError,
  assertPlaceReview,
  assertRating,
} from "@/lib/validation";

export type SavedImageInput = {
  uploadId: string;
  caption: string | null;
};

export type SavePlaceInput = {
  place: PlaceInput;
  rating: number | null;
  review: string | null;
  tags: string[];
  images: SavedImageInput[];
  sourcePostId: string | null;
  status: SavedPlaceStatus;
};

export type NewSavedPlace = Omit<SavePlaceInput, "place"> & {
  userId: string;
  placeId: string;
};

export type NewPost = {
  authorId: string;
  savedPlaceId: string;
  sourcePostId: string | null;
};

export type SavedPlaceUpdate = Partial<
  Pick<SavePlaceInput, "rating" | "review" | "tags" | "images" | "status">
>;

export type FeedCursor = {
  createdAt: Date;
  id: string;
};

export type FeedQuery = {
  userId: string;
  cursor: FeedCursor | null;
  take: number;
};

type AuthorSummary = {
  id: string;
  name: string;
  username: string;
  image: string | null;
};

export type FeedPost = Post & {
  author: AuthorSummary;
  savedPlace: UserSavedPlace & {
    place: Place;
    images: SavedPlaceImage[];
  };
  sourcePost: {
    id: string;
    author: AuthorSummary;
  } | null;
  counts: {
    likes: number;
    comments: number;
    reshares: number;
  };
  comments: {
    id: string;
    body: string;
    createdAt: Date;
    author: AuthorSummary;
  }[];
  likedByCurrentUser: boolean;
  savedByCurrentUser: boolean;
};

export type FeedPage = {
  items: FeedPost[];
  nextCursor: string | null;
};

export type PlaceReview = UserSavedPlace & {
  user: AuthorSummary;
  images: SavedPlaceImage[];
};

export type PlaceDetail = {
  place: Place;
  currentUserSave: UserSavedPlace | null;
  reviews: PlaceReview[];
};

export type SavedPlaceCard = UserSavedPlace & {
  place: Place;
  images: SavedPlaceImage[];
  post: { id: string } | null;
};

export type OwnedSavedPlace = UserSavedPlace & {
  images: Pick<SavedPlaceImage, "blobUploadId">[];
};

export interface PostWriteStore extends PostVisibilityStore {
  createSavedPlace(input: NewSavedPlace): Promise<UserSavedPlace>;
  createPost(input: NewPost): Promise<Post>;
  findSavedPlaceById(id: string): Promise<UserSavedPlace | null>;
  findOwnedSavedPlace(
    id: string,
    userId: string,
  ): Promise<OwnedSavedPlace | null>;
  updateSavedPlace(
    id: string,
    userId: string,
    input: SavedPlaceUpdate,
  ): Promise<UserSavedPlace>;
  deleteSavedPlace(id: string, userId: string): Promise<void>;
}

export interface PostsPersistence {
  transaction<T>(
    operation: (store: PostWriteStore) => Promise<T>,
  ): Promise<T>;
  findSavedPlaceWithPost(
    userId: string,
    placeId: string,
  ): Promise<{ savedPlace: UserSavedPlace; post: Post } | null>;
  findFeedPosts(query: FeedQuery): Promise<FeedPost[]>;
  findPostDetail(
    userId: string,
    postId: string,
  ): Promise<FeedPost | null>;
  findPlaceDetail(
    userId: string,
    placeId: string,
  ): Promise<PlaceDetail | null>;
}

export type PostDependencies = {
  persistence?: PostsPersistence;
  resolvePlace?: (input: PlaceInput) => Promise<Place>;
  assertCanViewPost?: (
    userId: string,
    postId: string,
    store?: PostVisibilityStore,
  ) => Promise<Post>;
};

export class PostError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "INVALID_CURSOR"
      | "NOT_FOUND",
    public readonly status: number,
  ) {
    super(message);
    this.name = "PostError";
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null) {
    throw new PostError("Invalid saved place input", "INVALID_INPUT", 400);
  }
  return value as JsonRecord;
}

function optionalReview(value: unknown): string | null {
  if (value == null || value === "") return null;
  try {
    const review = assertPlaceReview(value);
    return review.trim() || null;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new PostError(error.message, "INVALID_INPUT", 400);
    }
    throw error;
  }
}

function rating(value: unknown): number | null {
  try {
    return assertRating(value);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new PostError(error.message, "INVALID_INPUT", 400);
    }
    throw error;
  }
}

function tags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new PostError("Tags must be text", "INVALID_INPUT", 400);
  }
  if (value.length > 10) {
    throw new PostError("Tags are limited to 10", "INVALID_INPUT", 400);
  }
  const normalized: string[] = [];
  for (const tag of value) {
    const trimmed = tag.trim();
    if (trimmed) normalized.push(trimmed);
  }
  if (normalized.some((tag) => tag.length > 32)) {
    throw new PostError(
      "Each tag must be 32 characters or fewer",
      "INVALID_INPUT",
      400,
    );
  }
  return [...new Set(normalized)];
}

function image(value: unknown): SavedImageInput {
  const item = record(value);
  if (
    typeof item.uploadId !== "string" ||
    !item.uploadId.trim() ||
    item.uploadId.trim().length > 128 ||
    (item.caption !== null &&
      item.caption !== undefined &&
      typeof item.caption !== "string")
  ) {
    throw new PostError("Invalid saved image", "INVALID_INPUT", 400);
  }

  return {
    uploadId: item.uploadId.trim(),
    caption:
      typeof item.caption === "string" ? item.caption.trim() || null : null,
  };
}

function images(value: unknown): SavedImageInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PostError("Images must be a list", "INVALID_INPUT", 400);
  }
  if (value.length > 6) {
    throw new PostError("Images are limited to 6", "INVALID_INPUT", 400);
  }
  const parsed = value.map(image);
  if (new Set(parsed.map(({ uploadId }) => uploadId)).size !== parsed.length) {
    throw new PostError("Image uploads must be unique", "INVALID_INPUT", 400);
  }
  return parsed;
}

function savedStatus(value: unknown): SavedPlaceStatus {
  if (value === undefined) return "SAVED";
  if (
    value !== "SAVED" &&
    value !== "WANT_TO_GO" &&
    value !== "VISITED"
  ) {
    throw new PostError("Invalid saved place status", "INVALID_INPUT", 400);
  }
  return value;
}

function sourcePostId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new PostError("Invalid source post", "INVALID_INPUT", 400);
  }
  return value.trim();
}

export function parseSavePlaceInput(value: unknown): SavePlaceInput {
  const input = record(value);
  return {
    place: parsePlaceInput(input.place),
    rating: rating(input.rating),
    review: optionalReview(input.review),
    tags: tags(input.tags),
    images: images(input.images),
    sourcePostId: sourcePostId(input.sourcePostId),
    status: savedStatus(input.status),
  };
}

export function parseSavedPlaceUpdate(value: unknown): SavedPlaceUpdate {
  const input = record(value);
  const update: SavedPlaceUpdate = {};

  if (Object.hasOwn(input, "rating")) update.rating = rating(input.rating);
  if (Object.hasOwn(input, "review")) {
    update.review = optionalReview(input.review);
  }
  if (Object.hasOwn(input, "tags")) update.tags = tags(input.tags);
  if (Object.hasOwn(input, "images")) update.images = images(input.images);
  if (Object.hasOwn(input, "status")) update.status = savedStatus(input.status);

  return update;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

const authorSelect = {
  id: true,
  name: true,
  username: true,
  image: true,
} as const;

function visiblePostAuthors(userId: string): Prisma.PostWhereInput[] {
  return [
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
  ];
}

function postInclude(userId: string) {
  return {
    author: { select: authorSelect },
    savedPlace: {
      include: {
        images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
        place: {
          include: {
            savedBy: {
              where: { userId },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    },
    sourcePost: {
      select: {
        id: true,
        author: { select: authorSelect },
      },
    },
    _count: {
      select: {
        likes: true,
        comments: { where: { deletedAt: null } },
        reshares: { where: { deletedAt: null } },
      },
    },
    likes: {
      where: { userId },
      select: { userId: true },
      take: 1,
    },
    // ponytail: feed embeds latest 3 comments; add paginated loading when threads need full history.
    comments: {
      where: { deletedAt: null },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: authorSelect },
      },
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      take: 3,
    },
  } satisfies Prisma.PostInclude;
}

type PrismaFeedPost = Prisma.PostGetPayload<{
  include: ReturnType<typeof postInclude>;
}>;

function feedPost(row: PrismaFeedPost): FeedPost {
  const {
    _count,
    likes,
    comments,
    savedPlace: savedPlaceRow,
    ...post
  } = row;
  const { place: placeRow, ...savedPlace } = savedPlaceRow;
  const { savedBy, ...canonicalPlace } = placeRow;

  return {
    ...post,
    savedPlace: {
      ...savedPlace,
      place: canonicalPlace,
    },
    counts: {
      likes: _count.likes,
      comments: _count.comments,
      reshares: _count.reshares,
    },
    comments: comments.reverse(),
    likedByCurrentUser: likes.length > 0,
    savedByCurrentUser: savedBy.length > 0,
  };
}

function prismaStore(
  client: Pick<
    Prisma.TransactionClient,
    | "blobUpload"
    | "friendship"
    | "userSavedPlace"
    | "post"
    | "savedPlaceImage"
  >,
): PostWriteStore {
  async function claimImages(
    userId: string,
    savedImages: SavedImageInput[],
  ) {
    if (savedImages.length === 0) return [];
    const uploadIds = savedImages.map(({ uploadId }) => uploadId);
    const claimed = await client.blobUpload.updateMany({
      where: {
        id: { in: uploadIds },
        ownerId: userId,
        lifecycle: "UPLOADED",
      },
      data: { lifecycle: "CLAIMED" },
    });
    if (claimed.count !== uploadIds.length) {
      throw new PostError("Invalid image upload", "INVALID_INPUT", 400);
    }
    const uploads = await client.blobUpload.findMany({
      where: {
        id: { in: uploadIds },
        ownerId: userId,
        lifecycle: "CLAIMED",
      },
      select: { id: true },
    });
    const byId = new Map(uploads.map((upload) => [upload.id, upload]));
    return savedImages.map((image) => {
      const upload = byId.get(image.uploadId);
      if (!upload) {
        throw new PostError("Invalid image upload", "INVALID_INPUT", 400);
      }
      return {
        blobUploadId: upload.id,
        url: mediaUrl(upload.id),
        caption: image.caption,
      };
    });
  }

  async function markImagesPendingDelete(savedPlaceId: string) {
    const images = await client.savedPlaceImage.findMany({
      where: { savedPlaceId },
      select: { blobUploadId: true },
    });
    const uploadIds = images.map(({ blobUploadId }) => blobUploadId);
    if (uploadIds.length > 0) {
      await client.blobUpload.updateMany({
        where: { id: { in: uploadIds }, lifecycle: "CLAIMED" },
        data: { lifecycle: "PENDING_DELETE" },
      });
    }
  }

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
    createSavedPlace: async ({ images: savedImages, ...data }) => {
      const claimedImages = await claimImages(data.userId, savedImages);
      return client.userSavedPlace.create({
        data: {
          ...data,
          images: {
            create: claimedImages.map((savedImage, sortOrder) => ({
              url: savedImage.url,
              caption: savedImage.caption,
              sortOrder,
              blobUpload: { connect: { id: savedImage.blobUploadId } },
            })),
          },
        },
      });
    },
    createPost: (data) => client.post.create({ data }),
    findSavedPlaceById: (id) =>
      client.userSavedPlace.findUnique({ where: { id } }),
    findOwnedSavedPlace: (id, userId) =>
      client.userSavedPlace.findUnique({
        where: { id, userId },
        include: {
          images: { select: { blobUploadId: true } },
        },
      }),
    updateSavedPlace: async (id, userId, input) => {
      const { images: savedImages, ...data } = input;
      const savedPlace = await client.userSavedPlace.update({
        where: { id, userId },
        data,
      });
      if (savedImages) {
        await markImagesPendingDelete(id);
        await client.savedPlaceImage.deleteMany({
          where: { savedPlaceId: id },
        });
        const claimedImages = await claimImages(userId, savedImages);
        if (claimedImages.length > 0) {
          await client.savedPlaceImage.createMany({
            data: claimedImages.map((savedImage, sortOrder) => ({
              blobUploadId: savedImage.blobUploadId,
              url: savedImage.url,
              caption: savedImage.caption,
              savedPlaceId: id,
              sortOrder,
            })),
          });
        }
      }
      return savedPlace;
    },
    deleteSavedPlace: async (id, userId) => {
      await markImagesPendingDelete(id);
      await client.userSavedPlace.delete({ where: { id, userId } });
    },
  };
}

const defaultPersistence: PostsPersistence = {
  transaction: (operation) =>
    prisma.$transaction((transaction) =>
      operation(prismaStore(transaction)),
    ),
  findSavedPlaceWithPost: async (userId, placeId) => {
    const savedPlace = await prisma.userSavedPlace.findUnique({
      where: { userId_placeId: { userId, placeId } },
      include: { post: true },
    });
    if (!savedPlace?.post) return null;
    const { post, ...savedPlaceRecord } = savedPlace;
    return { savedPlace: savedPlaceRecord, post };
  },
  findFeedPosts: async ({ userId, cursor, take }) => {
    const where: Prisma.PostWhereInput = {
      deletedAt: null,
      OR: visiblePostAuthors(userId),
    };
    if (cursor) {
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const posts = await prisma.post.findMany({
      where,
      include: postInclude(userId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return posts.map(feedPost);
  },
  findPostDetail: async (userId, postId) => {
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
        OR: visiblePostAuthors(userId),
      },
      include: postInclude(userId),
    });
    return post ? feedPost(post) : null;
  },
  findPlaceDetail: async (userId, placeId) => {
    const place = await prisma.place.findFirst({
      where: {
        id: placeId,
        OR: [
          {
            externalSource: { not: null },
            externalPlaceId: { not: null },
          },
          {
            savedBy: {
              some: {
                OR: [
                  { userId },
                  {
                    user: {
                      requestsSent: {
                        some: {
                          addresseeId: userId,
                          status: "ACCEPTED",
                        },
                      },
                    },
                  },
                  {
                    user: {
                      requestsIn: {
                        some: {
                          requesterId: userId,
                          status: "ACCEPTED",
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      include: {
        savedBy: {
          where: {
            OR: [
              { userId },
              {
                user: {
                  requestsSent: {
                    some: { addresseeId: userId, status: "ACCEPTED" },
                  },
                },
              },
              {
                user: {
                  requestsIn: {
                    some: { requesterId: userId, status: "ACCEPTED" },
                  },
                },
              },
            ],
            post: { is: { deletedAt: null } },
          },
          include: {
            user: { select: authorSelect },
            images: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });
    if (!place) return null;
    const { savedBy, ...canonicalPlace } = place;
    const currentUserSave =
      savedBy.find((savedPlace) => savedPlace.userId === userId) ?? null;

    return {
      place: canonicalPlace,
      currentUserSave,
      reviews: savedBy.filter(
        (savedPlace) => savedPlace.userId !== userId,
      ),
    };
  },
};

function encodeCursor(post: Pick<Post, "createdAt" | "id">): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: post.createdAt.toISOString(),
      id: post.id,
    }),
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const cursor = record(decoded);
    if (
      typeof cursor.createdAt !== "string" ||
      typeof cursor.id !== "string" ||
      !cursor.id
    ) {
      throw new Error("invalid");
    }
    const createdAt = new Date(cursor.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid");
    return { createdAt, id: cursor.id };
  } catch {
    throw new PostError("Invalid feed cursor", "INVALID_CURSOR", 400);
  }
}

export async function saveAndSharePlace(
  userId: string,
  value: SavePlaceInput | unknown,
  dependencies: PostDependencies = {},
): Promise<{ savedPlace: UserSavedPlace; post: Post }> {
  const input = parseSavePlaceInput(value);
  const persistence = dependencies.persistence ?? defaultPersistence;
  const canonicalPlace = dependencies.resolvePlace
    ? await dependencies.resolvePlace(input.place)
    : await resolvePlace(input.place, { viewerId: userId });
  const existingBeforeWrite = await persistence.findSavedPlaceWithPost(
    userId,
    canonicalPlace.id,
  );
  if (existingBeforeWrite) return existingBeforeWrite;

  try {
    return await persistence.transaction(async (store) => {
      if (input.sourcePostId) {
        const sourcePost = await (
          dependencies.assertCanViewPost ?? assertCanViewPost
        )(userId, input.sourcePostId, store);
        const sourceSave = await store.findSavedPlaceById(
          sourcePost.savedPlaceId,
        );
        if (!sourceSave || sourceSave.placeId !== canonicalPlace.id) {
          throw new PostError(
            "Source post does not match this place",
            "INVALID_INPUT",
            400,
          );
        }
      }

      const savedPlace = await store.createSavedPlace({
        userId,
        placeId: canonicalPlace.id,
        rating: input.rating,
        review: input.review,
        tags: input.tags,
        images: input.images,
        sourcePostId: input.sourcePostId,
        status: input.status,
      });
      const post = await store.createPost({
        authorId: userId,
        savedPlaceId: savedPlace.id,
        sourcePostId: input.sourcePostId,
      });
      return { savedPlace, post };
    });
  } catch (error) {
    if (
      hasPrismaCode(error, "P2002") ||
      hasPrismaCode(error, "P2034") ||
      (error instanceof PostError &&
        error.code === "INVALID_INPUT" &&
        input.images.length > 0)
    ) {
      const existing = await persistence.findSavedPlaceWithPost(
        userId,
        canonicalPlace.id,
      );
      if (existing) return existing;
    }
    throw error;
  }
}

export async function updateSavedPlace(
  userId: string,
  id: string,
  value: SavedPlaceUpdate | unknown,
  persistence: PostsPersistence = defaultPersistence,
): Promise<UserSavedPlace> {
  const input = parseSavedPlaceUpdate(value);
  return persistence.transaction(async (store) => {
    const savedPlace = await store.findOwnedSavedPlace(id, userId);
    if (!savedPlace) {
      throw new PostError("Saved place not found", "NOT_FOUND", 404);
    }
    try {
      return await store.updateSavedPlace(id, userId, input);
    } catch (error) {
      if (hasPrismaCode(error, "P2025")) {
        throw new PostError("Saved place not found", "NOT_FOUND", 404);
      }
      throw error;
    }
  });
}

export async function deleteSavedPlace(
  userId: string,
  id: string,
  persistence: PostsPersistence = defaultPersistence,
): Promise<void> {
  await persistence.transaction(async (store) => {
    const savedPlace = await store.findOwnedSavedPlace(id, userId);
    if (!savedPlace) {
      throw new PostError("Saved place not found", "NOT_FOUND", 404);
    }
    try {
      await store.deleteSavedPlace(id, userId);
    } catch (error) {
      if (hasPrismaCode(error, "P2025")) {
        throw new PostError("Saved place not found", "NOT_FOUND", 404);
      }
      throw error;
    }
  });
}

export async function getFeed(
  userId: string,
  cursor?: string,
  limit = 20,
  persistence: PostsPersistence = defaultPersistence,
): Promise<FeedPage> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new PostError("Invalid feed limit", "INVALID_INPUT", 400);
  }
  const pageSize = Math.min(limit, 50);
  const posts = await persistence.findFeedPosts({
    userId,
    cursor: decodeCursor(cursor),
    take: pageSize + 1,
  });
  const hasMore = posts.length > pageSize;
  const items = hasMore ? posts.slice(0, pageSize) : posts;

  return {
    items,
    nextCursor:
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1])
        : null,
  };
}

export async function getPostDetail(
  userId: string,
  postId: string,
  persistence: PostsPersistence = defaultPersistence,
): Promise<FeedPost> {
  const post = await persistence.findPostDetail(userId, postId);
  if (!post) {
    throw new PostError("Post not found", "NOT_FOUND", 404);
  }
  return post;
}

export async function getSavedPlaces(
  userId: string,
): Promise<SavedPlaceCard[]> {
  return prisma.userSavedPlace.findMany({
    where: { userId },
    include: {
      place: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      post: { select: { id: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function getPlaceDetail(
  userId: string,
  placeId: string,
  persistence: PostsPersistence = defaultPersistence,
): Promise<PlaceDetail> {
  const detail = await persistence.findPlaceDetail(userId, placeId);
  if (!detail) throw new PostError("Place not found", "NOT_FOUND", 404);
  return detail;
}

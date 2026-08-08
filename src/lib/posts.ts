import type {
  Place,
  Post,
  Prisma,
  SavedPlaceImage,
  UserSavedPlace,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { assertCanViewPost } from "@/lib/friendships";
import {
  parsePlaceInput,
  resolvePlace,
  type PlaceInput,
} from "@/lib/places";
import {
  ValidationError,
  assertPlaceReview,
  assertRating,
} from "@/lib/validation";

export type SavedImageInput = {
  url: string;
  caption: string | null;
};

export type SavePlaceInput = {
  place: PlaceInput;
  rating: number | null;
  review: string | null;
  tags: string[];
  images: SavedImageInput[];
  sourcePostId: string | null;
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
  Pick<SavePlaceInput, "rating" | "review" | "tags" | "images">
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

export interface PostWriteStore {
  createSavedPlace(input: NewSavedPlace): Promise<UserSavedPlace>;
  createPost(input: NewPost): Promise<Post>;
  findSavedPlaceById(id: string): Promise<UserSavedPlace | null>;
  updateSavedPlace(
    id: string,
    input: SavedPlaceUpdate,
  ): Promise<UserSavedPlace>;
  deleteSavedPlace(id: string): Promise<void>;
}

export interface PostsPersistence {
  transaction<T>(
    operation: (store: PostWriteStore) => Promise<T>,
  ): Promise<T>;
  findSavedPlaceWithPost(
    userId: string,
    placeId: string,
  ): Promise<{ savedPlace: UserSavedPlace; post: Post } | null>;
  findSavedPlaceById(id: string): Promise<UserSavedPlace | null>;
  findFeedPosts(query: FeedQuery): Promise<FeedPost[]>;
  findPlaceDetail(
    userId: string,
    placeId: string,
  ): Promise<PlaceDetail | null>;
}

export type PostDependencies = {
  persistence?: PostsPersistence;
  resolvePlace?: (input: PlaceInput) => Promise<Place>;
  assertCanViewPost?: (userId: string, postId: string) => Promise<Post>;
};

export class PostError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "INVALID_CURSOR"
      | "NOT_FOUND"
      | "FORBIDDEN",
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
  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
}

function image(value: unknown): SavedImageInput {
  const item =
    typeof value === "string" ? { url: value, caption: null } : record(value);
  if (
    typeof item.url !== "string" ||
    (item.caption !== null &&
      item.caption !== undefined &&
      typeof item.caption !== "string")
  ) {
    throw new PostError("Invalid saved image", "INVALID_INPUT", 400);
  }

  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    throw new PostError("Invalid saved image URL", "INVALID_INPUT", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PostError("Invalid saved image URL", "INVALID_INPUT", 400);
  }

  return {
    url: url.toString(),
    caption:
      typeof item.caption === "string" ? item.caption.trim() || null : null,
  };
}

function images(value: unknown): SavedImageInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PostError("Images must be a list", "INVALID_INPUT", 400);
  }
  return value.map(image);
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
        comments: true,
        reshares: true,
      },
    },
    likes: {
      where: { userId },
      select: { userId: true },
      take: 1,
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
    likedByCurrentUser: likes.length > 0,
    savedByCurrentUser: savedBy.length > 0,
  };
}

function prismaStore(
  client: Pick<
    Prisma.TransactionClient,
    "userSavedPlace" | "post" | "savedPlaceImage"
  >,
): PostWriteStore {
  return {
    createSavedPlace: ({ images: savedImages, ...data }) =>
      client.userSavedPlace.create({
        data: {
          ...data,
          images: {
            create: savedImages.map((savedImage, sortOrder) => ({
              ...savedImage,
              sortOrder,
            })),
          },
        },
      }),
    createPost: (data) => client.post.create({ data }),
    findSavedPlaceById: (id) =>
      client.userSavedPlace.findUnique({ where: { id } }),
    updateSavedPlace: async (id, input) => {
      const { images: savedImages, ...data } = input;
      const savedPlace = await client.userSavedPlace.update({
        where: { id },
        data,
      });
      if (savedImages) {
        await client.savedPlaceImage.deleteMany({
          where: { savedPlaceId: id },
        });
        if (savedImages.length > 0) {
          await client.savedPlaceImage.createMany({
            data: savedImages.map((savedImage, sortOrder) => ({
              ...savedImage,
              savedPlaceId: id,
              sortOrder,
            })),
          });
        }
      }
      return savedPlace;
    },
    deleteSavedPlace: async (id) => {
      await client.userSavedPlace.delete({ where: { id } });
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
  findSavedPlaceById: (id) =>
    prisma.userSavedPlace.findUnique({ where: { id } }),
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
  findPlaceDetail: async (userId, placeId) => {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
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
  const canonicalPlace = await (dependencies.resolvePlace ?? resolvePlace)(
    input.place,
  );

  if (input.sourcePostId) {
    const sourcePost = await (
      dependencies.assertCanViewPost ?? assertCanViewPost
    )(userId, input.sourcePostId);
    const sourceSave = await persistence.findSavedPlaceById(
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

  try {
    return await persistence.transaction(async (store) => {
      const savedPlace = await store.createSavedPlace({
        userId,
        placeId: canonicalPlace.id,
        rating: input.rating,
        review: input.review,
        tags: input.tags,
        images: input.images,
        sourcePostId: input.sourcePostId,
      });
      const post = await store.createPost({
        authorId: userId,
        savedPlaceId: savedPlace.id,
        sourcePostId: input.sourcePostId,
      });
      return { savedPlace, post };
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
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
    const savedPlace = await store.findSavedPlaceById(id);
    if (!savedPlace) {
      throw new PostError("Saved place not found", "NOT_FOUND", 404);
    }
    if (savedPlace.userId !== userId) {
      throw new PostError(
        "You cannot edit this saved place",
        "FORBIDDEN",
        403,
      );
    }
    return store.updateSavedPlace(id, input);
  });
}

export async function deleteSavedPlace(
  userId: string,
  id: string,
  persistence: PostsPersistence = defaultPersistence,
): Promise<void> {
  await persistence.transaction(async (store) => {
    const savedPlace = await store.findSavedPlaceById(id);
    if (!savedPlace) {
      throw new PostError("Saved place not found", "NOT_FOUND", 404);
    }
    if (savedPlace.userId !== userId) {
      throw new PostError(
        "You cannot delete this saved place",
        "FORBIDDEN",
        403,
      );
    }
    await store.deleteSavedPlace(id);
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
): Promise<FeedPost> {
  await assertCanViewPost(userId, postId);
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
      OR: visiblePostAuthors(userId),
    },
    include: postInclude(userId),
  });
  if (!post) {
    throw new PostError("You cannot view this post", "FORBIDDEN", 403);
  }
  return feedPost(post);
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

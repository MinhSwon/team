import type { Friendship } from "@prisma/client";

import { prisma } from "@/lib/db";
import { friendPairKey } from "@/lib/friendships";
import { normalizeUsername } from "@/lib/validation";

export type ProfileUserRecord = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  bio: string | null;
};

export type ProfilePost = {
  id: string;
  createdAt: Date;
  savedPlace: {
    rating: number | null;
    review: string | null;
    tags: string[];
    place: {
      id: string;
      name: string;
      address: string;
      area: string | null;
    };
    images: { url: string }[];
  };
};

type ProfileUpdate = {
  name?: string;
  username?: string;
  bio?: string | null;
  image?: string | null;
};

export interface ProfilePersistence {
  findUserByUsername(username: string): Promise<ProfileUserRecord | null>;
  findFriendshipByPairKey(
    pairKey: string,
  ): Promise<Pick<Friendship, "status"> | null>;
  findPostsByAuthor(authorId: string): Promise<ProfilePost[]>;
  updateUser(
    userId: string,
    data: ProfileUpdate,
  ): Promise<ProfileUserRecord>;
}

export class ProfileError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "USERNAME_TAKEN",
    public readonly status: number,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

const publicUserSelect = {
  id: true,
  username: true,
  name: true,
  image: true,
  bio: true,
} as const;

const defaultPersistence: ProfilePersistence = {
  findUserByUsername: (username) =>
    prisma.user.findUnique({
      where: { username },
      select: publicUserSelect,
    }),
  findFriendshipByPairKey: (pairKey) =>
    prisma.friendship.findUnique({
      where: { pairKey },
      select: { status: true },
    }),
  findPostsByAuthor: (authorId) =>
    prisma.post.findMany({
      where: { authorId, deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        savedPlace: {
          select: {
            rating: true,
            review: true,
            tags: true,
            place: {
              select: {
                id: true,
                name: true,
                address: true,
                area: true,
              },
            },
            images: {
              select: { url: true },
              orderBy: { sortOrder: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  updateUser: (id, data) =>
    prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    }),
};

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function invalid(message: string): never {
  throw new ProfileError(message, "INVALID_INPUT", 400);
}

function profileUpdate(value: unknown): ProfileUpdate {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return invalid("Invalid profile input");
  }

  const input = value as Record<string, unknown>;
  const allowed = new Set(["name", "username", "bio", "avatar"]);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return invalid("Profile fields must be name, username, bio, or avatar");
  }

  const update: ProfileUpdate = {};

  if (Object.hasOwn(input, "name")) {
    if (typeof input.name !== "string") return invalid("Name must be text");
    const name = input.name.trim();
    if (!name || name.length > 80) {
      return invalid("Name must be 1-80 characters");
    }
    update.name = name;
  }

  if (Object.hasOwn(input, "username")) {
    if (typeof input.username !== "string") {
      return invalid("Username must be text");
    }
    const username = normalizeUsername(input.username);
    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      return invalid(
        "Username must be 3-30 characters using letters, numbers, dots, or underscores",
      );
    }
    update.username = username;
  }

  if (Object.hasOwn(input, "bio")) {
    if (input.bio !== null && typeof input.bio !== "string") {
      return invalid("Bio must be text");
    }
    const bio = typeof input.bio === "string" ? input.bio.trim() : "";
    if (bio.length > 500) return invalid("Bio must be 500 characters or fewer");
    update.bio = bio || null;
  }

  if (Object.hasOwn(input, "avatar")) {
    if (input.avatar !== null && typeof input.avatar !== "string") {
      return invalid("Avatar must be a URL");
    }
    const avatar =
      typeof input.avatar === "string" ? input.avatar.trim() : "";
    if (!avatar) {
      update.image = null;
    } else {
      if (avatar.length > 500) return invalid("Avatar URL is too long");
      try {
        const url = new URL(avatar);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password
        ) {
          return invalid("Avatar must be a valid HTTPS URL");
        }
        update.image = url.toString();
      } catch {
        return invalid("Avatar must be a valid HTTPS URL");
      }
    }
  }

  return update;
}

function publicUser(user: ProfileUserRecord) {
  return {
    username: user.username,
    name: user.name,
    avatar: user.image,
    bio: user.bio,
  };
}

export async function getProfile(
  viewerId: string,
  username: string,
  persistence: ProfilePersistence = defaultPersistence,
) {
  const user = await persistence.findUserByUsername(
    normalizeUsername(username),
  );
  if (!user) {
    throw new ProfileError("Profile not found", "NOT_FOUND", 404);
  }

  const self = viewerId === user.id;
  if (!self) {
    const friendship = await persistence.findFriendshipByPairKey(
      friendPairKey(viewerId, user.id),
    );
    if (friendship?.status !== "ACCEPTED") {
      throw new ProfileError("Profile not found", "NOT_FOUND", 404);
    }
  }

  return {
    ...publicUser(user),
    friendshipState: self ? ("SELF" as const) : ("ACCEPTED" as const),
    posts: await persistence.findPostsByAuthor(user.id),
  };
}

export async function updateProfile(
  userId: string,
  value: unknown,
  persistence: ProfilePersistence = defaultPersistence,
) {
  const update = profileUpdate(value);

  if (update.username) {
    const existing = await persistence.findUserByUsername(update.username);
    if (existing && existing.id !== userId) {
      throw new ProfileError("Username is already taken", "USERNAME_TAKEN", 409);
    }
  }

  try {
    return publicUser(await persistence.updateUser(userId, update));
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      throw new ProfileError(
        "Username is already taken",
        "USERNAME_TAKEN",
        409,
      );
    }
    throw error;
  }
}

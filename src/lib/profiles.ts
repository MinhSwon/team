import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/media";
import { normalizeUsername } from "@/lib/validation";

export type ProfileUserRecord = {
  id: string;
  username: string;
  name: string;
  bio: string | null;
};

export type VisibleProfileRecord = ProfileUserRecord & {
  posts: ProfilePost[];
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
  findVisibleProfile(
    viewerId: string,
    username: string,
  ): Promise<VisibleProfileRecord | null>;
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
  bio: true,
} as const;

const defaultPersistence: ProfilePersistence = {
  findUserByUsername: (username) =>
    prisma.user.findUnique({
      where: { username },
      select: publicUserSelect,
    }),
  findVisibleProfile: async (viewerId, username) => {
    const user = await prisma.user.findFirst({
      where: {
        username,
        OR: [
          { id: viewerId },
          {
            requestsSent: {
              some: { addresseeId: viewerId, status: "ACCEPTED" },
            },
          },
          {
            requestsIn: {
              some: { requesterId: viewerId, status: "ACCEPTED" },
            },
          },
        ],
      },
      select: {
        ...publicUserSelect,
        posts: {
          where: { deletedAt: null },
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
                  select: { blobUploadId: true },
                  orderBy: { sortOrder: "asc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });
    if (!user) return null;
    return {
      ...user,
      posts: user.posts.map((post) => ({
        ...post,
        savedPlace: {
          ...post.savedPlace,
          images: post.savedPlace.images.map(({ blobUploadId }) => ({
            url: mediaUrl(blobUploadId),
          })),
        },
      })),
    };
  },
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
      return invalid("Avatar must be null");
    }
    const avatar =
      typeof input.avatar === "string" ? input.avatar.trim() : "";
    if (!avatar) {
      update.image = null;
    } else {
      return invalid("Avatar uploads are not configured");
    }
  }

  return update;
}

function publicUser(user: ProfileUserRecord) {
  return {
    username: user.username,
    name: user.name,
    bio: user.bio,
  };
}

export async function getProfile(
  viewerId: string,
  username: string,
  persistence: ProfilePersistence = defaultPersistence,
) {
  const user = await persistence.findVisibleProfile(
    viewerId,
    normalizeUsername(username),
  );
  if (!user) {
    throw new ProfileError("Profile not found", "NOT_FOUND", 404);
  }

  const self = viewerId === user.id;
  const { posts, ...profileUser } = user;

  return {
    ...publicUser(profileUser),
    friendshipState: self ? ("SELF" as const) : ("ACCEPTED" as const),
    posts,
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

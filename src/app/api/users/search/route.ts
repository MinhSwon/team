import { prisma } from "@/lib/db";
import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  enforceRateLimit,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { PLACE_LIMITS } from "@/lib/validation";

type UserSearchDependencies = {
  requireUser: () => Promise<{ id: string }>;
  rateLimit: (request: Request, userId: string) => Promise<void>;
  findUsers: (
    currentUserId: string,
    query: string,
  ) => Promise<Array<{ id: string; username: string; name: string }>>;
};

const dependencies: UserSearchDependencies = {
  requireUser: requireCurrentUser,
  rateLimit: (request, userId) =>
    enforceRateLimit(request, userId, "userSearch"),
  findUsers: (currentUserId, query) =>
    prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        username: true,
        name: true,
      },
      orderBy: [{ username: "asc" }, { id: "asc" }],
      take: 20,
    }),
};

export async function handleUserSearch(
  request: Request,
  services: UserSearchDependencies = dependencies,
) {
  try {
    const currentUser = await services.requireUser();
    await services.rateLimit(request, currentUser.id);
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    if (!query) return Response.json({ users: [] });
    if (query.length > PLACE_LIMITS.query) {
      return Response.json(
        { error: "Search query is too long" },
        { status: 400 },
      );
    }

    const users = await services.findUsers(currentUser.id, query);

    return Response.json({ users });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleUserSearch(request);
}

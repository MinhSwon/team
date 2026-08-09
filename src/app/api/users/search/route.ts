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

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    await enforceRateLimit(request, currentUser.id, "userSearch");
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    if (!query) return Response.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUser.id },
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
    });

    return Response.json({ users });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

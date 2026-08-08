import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { getFeed, PostError } from "@/lib/posts";

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    const page = await getFeed(currentUser.id, cursor, limit);
    return Response.json(page);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof PostError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Could not load feed" }, { status: 500 });
  }
}

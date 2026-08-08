import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { FriendshipError } from "@/lib/friendships";
import { getPostDetail, PostError } from "@/lib/posts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { id } = await context.params;
    return Response.json({
      post: await getPostDetail(currentUser.id, id),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof FriendshipError || error instanceof PostError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Could not load post" }, { status: 500 });
  }
}

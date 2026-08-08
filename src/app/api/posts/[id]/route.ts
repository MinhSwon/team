import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { FriendshipError } from "@/lib/friendships";
import { getPostDetail, PostError } from "@/lib/posts";

export type PostRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  getPostDetail: typeof getPostDetail;
};

export async function handlePostGet(
  context: { params: Promise<{ id: string }> },
  dependencies: PostRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const { id } = await context.params;
    return Response.json({
      post: await dependencies.getPostDetail(currentUser.id, id),
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

export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlePostGet(context, {
    requireUser: requireCurrentUser,
    getPostDetail,
  });
}

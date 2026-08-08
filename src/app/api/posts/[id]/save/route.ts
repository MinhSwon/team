import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { FriendshipError } from "@/lib/friendships";
import {
  InteractionError,
  resavePost,
} from "@/lib/interactions";
import { PlaceResolutionError } from "@/lib/places";
import { PostError } from "@/lib/posts";

type SaveRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  resavePost: typeof resavePost;
};

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (
    error instanceof InteractionError ||
    error instanceof FriendshipError
  ) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }
  if (error instanceof PlaceResolutionError || error instanceof PostError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Could not save post" }, { status: 500 });
}

export async function handleSavePost(
  context: { params: Promise<{ id: string }> },
  dependencies: SaveRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const { id } = await context.params;
    return Response.json(await dependencies.resavePost(currentUser.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}

export function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleSavePost(context, {
    requireUser: requireCurrentUser,
    resavePost,
  });
}

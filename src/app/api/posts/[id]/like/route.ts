import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  InteractionError,
  togglePostLike,
} from "@/lib/interactions";

type LikeRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  togglePostLike: typeof togglePostLike;
};

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof InteractionError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Could not update like" }, { status: 500 });
}

export async function handleLikePost(
  context: { params: Promise<{ id: string }> },
  dependencies: LikeRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const { id } = await context.params;
    return Response.json(
      await dependencies.togglePostLike(currentUser.id, id),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleLikePost(context, {
    requireUser: requireCurrentUser,
    togglePostLike,
  });
}

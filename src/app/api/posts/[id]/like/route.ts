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
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies: LikeRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const input: unknown = await request.json();
    if (
      typeof input !== "object" ||
      input === null ||
      !("liked" in input) ||
      typeof input.liked !== "boolean"
    ) {
      throw new InteractionError(
        "Liked state must be boolean",
        "INVALID_INPUT",
        400,
      );
    }
    const { id } = await context.params;
    return Response.json(
      await dependencies.togglePostLike(currentUser.id, id, input.liked),
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleLikePost(request, context, {
    requireUser: requireCurrentUser,
    togglePostLike,
  });
}

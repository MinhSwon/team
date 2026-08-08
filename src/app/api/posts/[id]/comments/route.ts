import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  createPostComment,
  InteractionError,
} from "@/lib/interactions";

type CommentRouteDependencies = {
  requireUser: () => Promise<{
    id: string;
    name?: string;
    username?: string;
    image?: string | null;
  }>;
  createPostComment: typeof createPostComment;
};

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof InteractionError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ error: "Could not add comment" }, { status: 500 });
}

export async function handleCommentPost(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies: CommentRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const { id } = await context.params;
    const input: unknown = await request.json();
    const body =
      typeof input === "object" && input !== null && "body" in input
        ? input.body
        : undefined;
    const result = await dependencies.createPostComment(
      currentUser.id,
      id,
      body,
    );
    return Response.json({
      ...result,
      comment: {
        ...result.comment,
        author: {
          id: currentUser.id,
          name: currentUser.name ?? "You",
          username: currentUser.username ?? "you",
          image: currentUser.image ?? null,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleCommentPost(request, context, {
    requireUser: requireCurrentUser,
    createPostComment,
  });
}

import {
  FriendshipError,
  removeFriendship,
  respondToFriendRequest,
} from "@/lib/friendships";
import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof FriendshipError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { id } = await context.params;
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("action" in body) ||
      (body.action !== "accept" && body.action !== "reject")
    ) {
      return Response.json(
        { error: 'action must be "accept" or "reject"' },
        { status: 400 },
      );
    }

    const friendship = await respondToFriendRequest(
      currentUser.id,
      id,
      body.action,
    );
    return Response.json({ friendship });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { id } = await context.params;
    await removeFriendship(currentUser.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

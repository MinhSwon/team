import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  PostError,
  deleteSavedPlace,
  updateSavedPlace,
} from "@/lib/posts";

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof PostError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ error: "Saved place request failed" }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { id } = await context.params;
    const savedPlace = await updateSavedPlace(
      currentUser.id,
      id,
      await request.json(),
    );
    return Response.json({ savedPlace });
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
    await deleteSavedPlace(currentUser.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

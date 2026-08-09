import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  PostError,
  deleteSavedPlace,
  updateSavedPlace,
} from "@/lib/posts";

type SavedMutationDependencies = {
  requireUser: () => Promise<{ id: string }>;
  updateSavedPlace: typeof updateSavedPlace;
  deleteSavedPlace: typeof deleteSavedPlace;
};

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

export async function handleSavedPatch(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies: SavedMutationDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const { id } = await context.params;
    const savedPlace = await dependencies.updateSavedPlace(
      currentUser.id,
      id,
      await request.json(),
    );
    return Response.json({ savedPlace });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleSavedDelete(
  _request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies: SavedMutationDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const { id } = await context.params;
    await dependencies.deleteSavedPlace(currentUser.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

const dependencies: SavedMutationDependencies = {
  requireUser: requireCurrentUser,
  updateSavedPlace,
  deleteSavedPlace,
};

export function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleSavedPatch(request, context, dependencies);
}

export function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleSavedDelete(request, context, dependencies);
}

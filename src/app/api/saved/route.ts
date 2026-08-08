import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { PlaceResolutionError } from "@/lib/places";
import {
  PostError,
  saveAndSharePlace,
} from "@/lib/posts";

export type SavedRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  saveAndSharePlace: (
    userId: string,
    input: unknown,
  ) => ReturnType<typeof saveAndSharePlace>;
};

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (
    error instanceof PlaceResolutionError &&
    error.code === "MANUAL_CONFIRMATION_REQUIRED"
  ) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        requiresConfirmation: true,
        place: error.fallback,
      },
      { status: 422 },
    );
  }
  if (error instanceof PlaceResolutionError || error instanceof PostError) {
    return Response.json(
      { error: error.message },
      { status: error.status >= 400 ? error.status : 500 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ error: "Could not save place" }, { status: 500 });
}

export async function handleSavedPost(
  request: Request,
  dependencies: SavedRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const result = await dependencies.saveAndSharePlace(
      currentUser.id,
      await request.json(),
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export function POST(request: Request) {
  return handleSavedPost(request, {
    requireUser: requireCurrentUser,
    saveAndSharePlace,
  });
}

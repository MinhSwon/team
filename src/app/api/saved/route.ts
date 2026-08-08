import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { PlaceResolutionError } from "@/lib/places";
import {
  PostError,
  saveAndSharePlace,
} from "@/lib/posts";

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof PlaceResolutionError || error instanceof PostError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ error: "Could not save place" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const result = await saveAndSharePlace(
      currentUser.id,
      await request.json(),
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

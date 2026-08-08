import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  parsePlaceInput,
  PlaceResolutionError,
  resolvePlace,
} from "@/lib/places";

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const place = await resolvePlace(parsePlaceInput(await request.json()));
    return Response.json({ place });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof PlaceResolutionError &&
      error.code === "MANUAL_CONFIRMATION_REQUIRED"
    ) {
      return Response.json({
        requiresConfirmation: true,
        place: error.fallback,
      });
    }
    if (error instanceof PlaceResolutionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return Response.json(
      { error: "Place resolution failed" },
      { status: 500 },
    );
  }
}

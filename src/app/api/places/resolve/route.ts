import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  parsePlaceInput,
  PlaceResolutionError,
  resolvePlace,
} from "@/lib/places";
import {
  enforceRateLimit,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    await enforceRateLimit(request, currentUser.id, "placeSearch");
    const input = parsePlaceInput(await request.json());
    if (input.type === "manual") {
      return Response.json({
        place: {
          name: input.name.trim(),
          address: input.address.trim(),
        },
      });
    }
    const place = await resolvePlace(input, { viewerId: currentUser.id });
    return Response.json({ place });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RateLimitError) return rateLimitResponse(error);
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

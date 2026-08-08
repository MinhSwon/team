import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { searchPlaces } from "@/lib/places";
import { PLACE_LIMITS } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    if (query.length > PLACE_LIMITS.query) {
      return Response.json(
        { error: "Search query is too long" },
        { status: 400 },
      );
    }

    return Response.json({ candidates: await searchPlaces(query) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    return Response.json({ error: "Place search failed" }, { status: 500 });
  }
}

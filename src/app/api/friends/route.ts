import {
  FriendshipError,
  getFriendLists,
  requestFriendship,
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

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    return Response.json(await getFriendLists(currentUser.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("addresseeId" in body) ||
      typeof body.addresseeId !== "string" ||
      !body.addresseeId.trim()
    ) {
      return Response.json(
        { error: "addresseeId is required" },
        { status: 400 },
      );
    }

    const friendship = await requestFriendship(
      currentUser.id,
      body.addresseeId.trim(),
    );
    return Response.json({ friendship }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

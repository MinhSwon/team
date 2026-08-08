import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  InteractionError,
  markNotificationsRead,
} from "@/lib/interactions";

type NotificationReadRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  markNotificationsRead: typeof markNotificationsRead;
};

export async function handleNotificationsPatch(
  request: Request,
  dependencies: NotificationReadRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    const updated = await dependencies.markNotificationsRead(
      currentUser.id,
      await request.json(),
    );
    return Response.json({ updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof InteractionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return Response.json(
      { error: "Could not update notifications" },
      { status: 500 },
    );
  }
}

export function PATCH(request: Request) {
  return handleNotificationsPatch(request, {
    requireUser: requireCurrentUser,
    markNotificationsRead,
  });
}

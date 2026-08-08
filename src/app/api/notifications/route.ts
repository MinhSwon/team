import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { listNotifications } from "@/lib/interactions";

type NotificationRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  listNotifications: typeof listNotifications;
};

export async function handleNotificationsGet(
  dependencies: NotificationRouteDependencies,
) {
  try {
    const currentUser = await dependencies.requireUser();
    return Response.json({
      notifications: await dependencies.listNotifications(currentUser.id),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    return Response.json(
      { error: "Could not load notifications" },
      { status: 500 },
    );
  }
}

export function GET() {
  return handleNotificationsGet({
    requireUser: requireCurrentUser,
    listNotifications,
  });
}

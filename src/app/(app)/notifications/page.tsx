import {
  Bell,
  Check,
  CheckCheck,
  Heart,
  MessageCircle,
  UserCheck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import Navigation from "@/components/Navigation";
import { requireCurrentUser } from "@/lib/current-user";
import {
  listNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/lib/interactions";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

async function markRead(formData: FormData) {
  "use server";

  const currentUser = await requireCurrentUser();
  const id = formData.get("id");
  await markNotificationsRead(
    currentUser.id,
    typeof id === "string" && id ? { ids: [id] } : { all: true },
  );
  revalidatePath("/notifications");
}

function notificationContent(notification: NotificationItem) {
  switch (notification.type) {
    case "FRIEND_REQUEST":
      return {
        icon: UserPlus,
        text: "sent you a friend request",
        href: "/friends",
      };
    case "FRIEND_ACCEPTED":
      return {
        icon: UserCheck,
        text: "accepted your friend request",
        href: "/friends",
      };
    case "POST_LIKED":
      return {
        icon: Heart,
        text: `liked ${notification.post?.placeName ?? "your place"}`,
        href: notification.post
          ? `/places/${notification.post.placeId}`
          : "/feed",
      };
    case "POST_COMMENTED":
      return {
        icon: MessageCircle,
        text: `commented on ${notification.post?.placeName ?? "your place"}`,
        href: notification.post
          ? `/places/${notification.post.placeId}`
          : "/feed",
      };
  }
}

export default async function NotificationsPage() {
  const currentUser = await requireCurrentUser();
  const notifications = await listNotifications(currentUser.id);
  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Notifications</h1>
            <p className="mt-1 text-sm text-slate-400">
              Recent friend and post activity.
            </p>
          </div>
          {hasUnread && (
            <form action={markRead}>
              <button
                aria-label="Mark all notifications read"
                className="grid h-11 w-11 place-items-center rounded-md border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-white"
                title="Mark all read"
                type="submit"
              >
                <CheckCheck className="h-5 w-5" />
              </button>
            </form>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="border-y border-slate-800 py-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 font-semibold text-white">
              No notifications yet
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border-y border-slate-800">
            {notifications.map((notification) => {
              const content = notificationContent(notification);
              const Icon = content.icon;

              return (
                <div
                  className={`flex gap-3 py-4 ${
                    notification.readAt ? "" : "bg-slate-900/50"
                  }`}
                  key={notification.id}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-900 text-amber-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      className="text-sm leading-6 text-slate-300 hover:text-white"
                      href={content.href}
                    >
                      <span className="font-semibold text-white">
                        {notification.actor.name}
                      </span>{" "}
                      {content.text}
                    </Link>
                    {notification.comment && (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                        {notification.comment.body}
                      </p>
                    )}
                    <time
                      className="mt-1 block text-xs text-slate-500"
                      dateTime={notification.createdAt.toISOString()}
                    >
                      {dateFormat.format(notification.createdAt)}
                    </time>
                  </div>
                  {!notification.readAt && (
                    <form action={markRead}>
                      <input
                        name="id"
                        type="hidden"
                        value={notification.id}
                      />
                      <button
                        aria-label="Mark notification read"
                        className="grid h-10 w-10 place-items-center text-slate-500 hover:text-amber-400"
                        title="Mark read"
                        type="submit"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

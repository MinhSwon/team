import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/current-user";

export default async function ProfilePage() {
  const currentUser = await requireCurrentUser();
  redirect(`/profile/${currentUser.username}`);
}

import FriendsClient from "./FriendsClient";

import { redirect } from "next/navigation";

import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import { getFriendLists, type FriendLists } from "@/lib/friendships";

async function loadInitialLists(): Promise<FriendLists> {
  try {
    const currentUser = await requireCurrentUser();
    return await getFriendLists(currentUser.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
}

export default async function FriendsPage() {
  const initialLists = await loadInitialLists();
  return <FriendsClient initialLists={initialLists} />;
}

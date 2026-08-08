import type { User } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";

type GetUser = () => Promise<User | null>;
type Redirect = (path: string) => never;

export async function protectAppRoute(
  getUser: GetUser = getCurrentUser,
  redirectTo: Redirect = redirect,
): Promise<User> {
  const user = await getUser();

  if (!user) redirectTo("/login");

  return user;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await protectAppRoute();

  return (
    <div className="min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      {children}
    </div>
  );
}

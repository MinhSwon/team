import type { User } from "@prisma/client";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function getCurrentUser(
  requestHeaders: Promise<Headers> = headers(),
): Promise<User | null> {
  const session = await auth.api.getSession({
    headers: await requestHeaders,
  });

  return (session?.user as User | undefined) ?? null;
}

export async function requireCurrentUser(
  requestHeaders: Promise<Headers> = headers(),
): Promise<User> {
  const user = await getCurrentUser(requestHeaders);

  if (!user) throw new UnauthorizedError();

  return user;
}

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const RATE_LIMITS = {
  userSearch: { limit: 30, windowSeconds: 60, includeIp: true },
  placeSearch: { limit: 20, windowSeconds: 60, includeIp: true },
  friendRequest: { limit: 10, windowSeconds: 3600, includeIp: true },
  comment: { limit: 20, windowSeconds: 60, includeIp: true },
  upload: { limit: 10, windowSeconds: 3600, includeIp: true },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;
export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
};

export interface RateLimitStore {
  consume(
    key: string,
    now: Date,
    windowSeconds: number,
  ): Promise<{ count: number; resetAt: Date }>;
}

export class RateLimitError extends Error {
  readonly status = 429;

  constructor(public readonly retryAfter: number) {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}

const defaultStore: RateLimitStore = {
  consume: async (key, now, windowSeconds) => {
    const resetAt = new Date(now.getTime() + windowSeconds * 1000);
    const [row] = await prisma.$queryRaw<
      Array<{ count: number; resetAt: Date }>
    >(Prisma.sql`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${resetAt}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
          ELSE "RateLimitBucket"."resetAt"
        END,
        "updatedAt" = ${now}
      RETURNING "count", "resetAt"
    `);
    if (!row) throw new Error("Rate-limit bucket update returned no row");
    return row;
  },
};

function hashedKey(scope: string, dimension: string, value: string): string {
  return createHash("sha256")
    .update(`${scope}:${dimension}:${value}`)
    .digest("hex");
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 128 ? ip : null;
}

export async function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  store: RateLimitStore = defaultStore,
  now = new Date(),
): Promise<void> {
  const result = await store.consume(key, now, policy.windowSeconds);
  if (result.count > policy.limit) {
    throw new RateLimitError(
      Math.max(1, Math.ceil((result.resetAt.getTime() - now.getTime()) / 1000)),
    );
  }
}

export async function enforceRateLimit(
  request: Request,
  userId: string,
  name: RateLimitName,
): Promise<void> {
  const policy = RATE_LIMITS[name];
  await consumeRateLimit(hashedKey(name, "user", userId), policy);
  const ip = requestIp(request);
  if (policy.includeIp && ip) {
    await consumeRateLimit(hashedKey(name, "ip", ip), policy);
  }
}

export function rateLimitResponse(error: RateLimitError): Response {
  return Response.json(
    { error: error.message },
    {
      status: error.status,
      headers: { "Retry-After": String(error.retryAfter) },
    },
  );
}

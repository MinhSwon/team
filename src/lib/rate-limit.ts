import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { Prisma } from "@prisma/client";
import type { BetterAuthRateLimitStorage } from "@better-auth/core";
import { getIPFromHeader } from "@better-auth/core/utils/ip";

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

type RateLimitBucket = {
  count: number;
  resetAt: Date;
  updatedAt: Date;
};

export interface RateLimitStore {
  get(key: string): Promise<RateLimitBucket | null>;
  set(key: string, value: RateLimitBucket): Promise<void>;
  consume(
    key: string,
    now: Date,
    windowSeconds: number,
  ): Promise<{ count: number; resetAt: Date }>;
  pruneExpired(before: Date): Promise<number>;
}

export class RateLimitError extends Error {
  readonly status = 429;

  constructor(public readonly retryAfter: number) {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}

const defaultStore: RateLimitStore = {
  get: (key) =>
    prisma.rateLimitBucket.findUnique({
      where: { key },
      select: { count: true, resetAt: true, updatedAt: true },
    }),
  set: async (key, value) => {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      update: value,
      create: { key, ...value },
    });
  },
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
  pruneExpired: async (before) => {
    const result = await prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lte: before } },
    });
    return result.count;
  },
};

function hashedKey(scope: string, dimension: string, value: string): string {
  return createHash("sha256")
    .update(`${scope}:${dimension}:${value}`)
    .digest("hex");
}

export function trustedProxyList(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.TRUSTED_PROXY_IPS?.trim() ?? "";
  if (!raw) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "TRUSTED_PROXY_IPS is required in production and must list the deployment proxy IPs or CIDR ranges",
      );
    }
    return [];
  }

  const values = raw.split(",").map((value) => value.trim());
  const invalid = values.filter((value) => {
    if (!value) return true;
    const parts = value.split("/");
    if (parts.length > 2) return true;
    const [address, prefix] = parts;
    const family = isIP(address ?? "");
    if (!family) return true;
    if (prefix === undefined) return false;
    if (!/^\d+$/.test(prefix)) return true;
    const bits = Number(prefix);
    return !Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128);
  });
  if (invalid.length > 0) {
    throw new Error(
      `TRUSTED_PROXY_IPS contains invalid proxy addresses: ${invalid.join(", ")}`,
    );
  }
  return values;
}

export function requestIp(
  request: Request,
  trustedProxies = trustedProxyList(),
): string | null {
  if (trustedProxies.length === 0) return null;
  for (const header of ["x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(header);
    if (!value) continue;
    const ip = getIPFromHeader(value, { trustedProxies });
    if (ip) return ip;
  }
  return null;
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

export function createBetterAuthRateLimitStorage(
  store: RateLimitStore = defaultStore,
  now: () => Date = () => new Date(),
): BetterAuthRateLimitStorage {
  const keyFor = (key: string) => hashedKey("better-auth", "ip-path", key);
  return {
    get: async (key) => {
      const row = await store.get(keyFor(key));
      return row
        ? {
            key,
            count: row.count,
            lastRequest: row.updatedAt.getTime(),
          }
        : null;
    },
    set: async (key, value) => {
      const updatedAt = new Date(value.lastRequest);
      await store.set(keyFor(key), {
        count: value.count,
        resetAt: new Date(updatedAt.getTime() + 15 * 60 * 1000),
        updatedAt,
      });
    },
    consume: async (key, rule) => {
      const current = now();
      const result = await store.consume(
        keyFor(key),
        current,
        rule.window,
      );
      const allowed = result.count <= rule.max;
      return {
        allowed,
        retryAfter: allowed
          ? null
          : Math.max(
              1,
              Math.ceil(
                (result.resetAt.getTime() - current.getTime()) / 1000,
              ),
            ),
      };
    },
  };
}

export function pruneExpiredRateLimitBuckets(
  before = new Date(),
  store: Pick<RateLimitStore, "pruneExpired"> = defaultStore,
): Promise<number> {
  return store.pruneExpired(before);
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

import assert from "node:assert/strict";
import test from "node:test";

type Bucket = {
  count: number;
  resetAt: Date;
  updatedAt: Date;
};

test("Better Auth custom storage consumes atomically across instances", async () => {
  const rateLimits = await import("./rate-limit");
  assert.equal(
    typeof rateLimits.createBetterAuthRateLimitStorage,
    "function",
    "Better Auth PostgreSQL storage factory must exist",
  );

  const buckets = new Map<string, Bucket>();
  const store = {
    get: async (key: string) => buckets.get(key) ?? null,
    set: async (key: string, value: Bucket) => {
      buckets.set(key, value);
    },
    consume: async (key: string, now: Date, windowSeconds: number) => {
      const current = buckets.get(key);
      const resetAt = new Date(now.getTime() + windowSeconds * 1000);
      const next =
        !current || current.resetAt <= now
          ? { count: 1, resetAt, updatedAt: now }
          : { ...current, count: current.count + 1, updatedAt: now };
      buckets.set(key, next);
      return next;
    },
    pruneExpired: async (before: Date) => {
      let count = 0;
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= before) {
          buckets.delete(key);
          count += 1;
        }
      }
      return count;
    },
  };
  const now = new Date("2026-08-09T12:00:00.000Z");
  const first = rateLimits.createBetterAuthRateLimitStorage(store, () => now);
  const second = rateLimits.createBetterAuthRateLimitStorage(store, () => now);
  const results = await Promise.all([
    first.consume?.("sign-in", { window: 60, max: 2 }),
    second.consume?.("sign-in", { window: 60, max: 2 }),
    first.consume?.("sign-in", { window: 60, max: 2 }),
    second.consume?.("sign-in", { window: 60, max: 2 }),
  ]);

  assert.equal(results.filter((result) => result?.allowed).length, 2);
  assert.equal(results.filter((result) => result?.allowed === false).length, 2);
  assert.equal(buckets.size, 1);
});

test("proxy IP headers require explicit trusted-proxy configuration", async () => {
  const rateLimits = await import("./rate-limit");
  const request = new Request("http://localhost", {
    headers: { "x-forwarded-for": "203.0.113.5" },
  });

  assert.equal(rateLimits.requestIp(request, []), null);
  assert.equal(
    rateLimits.requestIp(request, ["127.0.0.1/32"]),
    "203.0.113.5",
  );
  assert.equal(
    rateLimits.requestIp(
      new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "198.51.100.9, 127.0.0.1",
        },
      }),
      ["127.0.0.1/32"],
    ),
    "198.51.100.9",
  );
});

test("trusted proxy parser rejects malformed IP and CIDR entries", async () => {
  const { trustedProxyList } = await import("./rate-limit");

  for (const value of [
    "127.0.0.1/",
    "127.0.0.1//32",
    "127.0.0.1/33",
    "127.0.0.1/not-a-prefix",
    "999.0.0.1",
    "::1/",
    "::1/129",
    "/24",
    "127.0.0.1,",
    ",127.0.0.1",
  ]) {
    assert.throws(
      () =>
        trustedProxyList({
          NODE_ENV: "production",
          TRUSTED_PROXY_IPS: value,
        }),
      /TRUSTED_PROXY_IPS/,
      value,
    );
  }
});

test("expired PostgreSQL rate-limit buckets are pruned", async () => {
  const rateLimits = await import("./rate-limit");
  assert.equal(
    typeof rateLimits.pruneExpiredRateLimitBuckets,
    "function",
    "rate-limit pruning helper must exist",
  );

  let cutoff: Date | undefined;
  const removed = await rateLimits.pruneExpiredRateLimitBuckets(
    new Date("2026-08-09T12:00:00.000Z"),
    {
      pruneExpired: async (before: Date) => {
        cutoff = before;
        return 3;
      },
    },
  );

  assert.equal(cutoff?.toISOString(), "2026-08-09T12:00:00.000Z");
  assert.equal(removed, 3);
});

test("acceptance IP generation varies the IPv6 /64 prefix", async () => {
  const { createAcceptanceIp } = await import(
    "../../scripts/acceptance-support"
  );

  assert.equal(
    createAcceptanceIp(
      Buffer.from("000100020003000400050006", "hex"),
    ),
    "2001:db8:1:2:3:4:5:6",
  );
});

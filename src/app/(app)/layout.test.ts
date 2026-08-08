import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import type { User } from "@prisma/client";

import { protectAppRoute } from "./layout";

const user: User = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  image: null,
  username: "alice",
  bio: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("protected app routes invoke server identity", async () => {
  let calls = 0;

  const result = await protectAppRoute(async () => {
    calls += 1;
    return user;
  });

  assert.equal(calls, 1);
  assert.equal(result, user);
});

test("protected app routes redirect anonymous users to login", async () => {
  let destination = "";

  await assert.rejects(
    protectAppRoute(
      async () => null,
      (path) => {
        destination = path;
        throw new Error("redirect");
      },
    ),
    /redirect/,
  );

  assert.equal(destination, "/login");
});

test("auth pages remain outside the protected route group", () => {
  assert.equal(
    existsSync(new URL("../(auth)/login/page.tsx", import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL("../(auth)/register/page.tsx", import.meta.url)),
    true,
  );
  assert.equal(existsSync(new URL("./login/page.tsx", import.meta.url)), false);
  assert.equal(
    existsSync(new URL("./register/page.tsx", import.meta.url)),
    false,
  );
});

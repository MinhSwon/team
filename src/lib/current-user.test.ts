import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { User } from "@prisma/client";

import { auth } from "./auth";
import {
  UnauthorizedError,
  requireCurrentUser,
} from "./current-user";

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

test("requireCurrentUser returns the authenticated user", async () => {
  const getSession = mock.method(auth.api, "getSession", async () => ({
    session: {
      id: "session-1",
      token: "token",
      userId: user.id,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      ipAddress: null,
      userAgent: null,
    },
    user,
  }));

  try {
    assert.equal(
      await requireCurrentUser(Promise.resolve(new Headers())),
      user,
    );
  } finally {
    getSession.mock.restore();
  }
});

test("requireCurrentUser rejects an anonymous request", async () => {
  const getSession = mock.method(auth.api, "getSession", async () => null);

  try {
    await assert.rejects(
      requireCurrentUser(Promise.resolve(new Headers())),
      UnauthorizedError,
    );
  } finally {
    getSession.mock.restore();
  }
});

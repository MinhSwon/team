import assert from "node:assert/strict";
import test from "node:test";

import {
  handleProfileGet,
  handleProfilePatch,
} from "./route";
import { UnauthorizedError } from "@/lib/current-user";

test("profile GET uses session viewer and returns public fields only", async () => {
  let viewerId = "";
  const response = await handleProfileGet(
    new Request("http://localhost/api/profile?username=alice"),
    {
      requireUser: async () => ({ id: "viewer-1" }),
      getProfile: async (currentUserId, username) => {
        viewerId = currentUserId;
        assert.equal(username, "alice");
        return {
          username: "alice",
          name: "Alice",
          avatar: null,
          bio: null,
          friendshipState: "SELF" as const,
          posts: [],
        };
      },
      updateProfile: async () => {
        throw new Error("unused");
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(viewerId, "viewer-1");
  const body = await response.json();
  assert.equal("email" in body, false);
  assert.equal(body.username, "alice");
});

test("profile PATCH updates only session user identity", async () => {
  let updatedUserId = "";
  const response = await handleProfilePatch(
    new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "attacker-selected",
        name: "Alice Smith",
      }),
    }),
    {
      requireUser: async () => ({ id: "session-user" }),
      getProfile: async () => {
        throw new Error("unused");
      },
      updateProfile: async (userId) => {
        updatedUserId = userId;
        return {
          username: "alice",
          name: "Alice Smith",
          avatar: null,
          bio: null,
        };
      },
    },
  );

  assert.equal(updatedUserId, "session-user");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    username: "alice",
    name: "Alice Smith",
    avatar: null,
    bio: null,
  });
});

test("profile API requires username", async () => {
  const dependencies = {
    requireUser: async () => ({ id: "viewer-1" }),
    getProfile: async () => {
      throw new Error("unused");
    },
    updateProfile: async () => {
      throw new Error("unused");
    },
  };
  const missingUsername = await handleProfileGet(
    new Request("http://localhost/api/profile"),
    dependencies,
  );

  assert.equal(missingUsername.status, 400);
  assert.deepEqual(await missingUsername.json(), {
    error: "username is required",
  });
});

test("profile GET and PATCH return 401 when session identity is absent", async () => {
  const dependencies = {
    requireUser: async () => {
      throw new UnauthorizedError();
    },
    getProfile: async () => {
      throw new Error("must not read profile");
    },
    updateProfile: async () => {
      throw new Error("must not update profile");
    },
  };

  const responses = await Promise.all([
    handleProfileGet(
      new Request("http://localhost/api/profile?username=alice"),
      dependencies,
    ),
    handleProfilePatch(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
      }),
      dependencies,
    ),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  }
});

test("profile GET uses read-specific unexpected error wording", async () => {
  const response = await handleProfileGet(
    new Request("http://localhost/api/profile?username=alice"),
    {
      requireUser: async () => ({ id: "viewer-1" }),
      getProfile: async () => {
        throw new Error("database unavailable");
      },
      updateProfile: async () => {
        throw new Error("unused");
      },
    },
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Could not load profile",
  });
});

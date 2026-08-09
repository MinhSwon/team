import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { demoUsers } from "../src/lib/demo-users";
import { friendPairKey } from "../src/lib/friendships";

export type AcceptanceResponse = {
  status: number;
  body: unknown;
};

export type AcceptanceClient = {
  request(path: string, init?: RequestInit): Promise<AcceptanceResponse>;
};

export function createAcceptanceIp(bytes = randomBytes(12)): string {
  const suffix = [0, 2, 4, 6, 8, 10]
    .map((offset) => bytes.readUInt16BE(offset).toString(16))
    .join(":");
  return `2001:db8:${suffix}`;
}

type RuntimeState = {
  users: Record<string, { id: string }>;
  friendshipId?: string;
  manualSavedId?: string;
  manualPlaceId?: string;
  manualPostId?: string;
  searchPostId?: string;
  mapsPostId?: string;
  bobSavedId?: string;
  bobPostId?: string;
};

const criterionNames = [
  "demo users sign in",
  "friend request is sent and accepted",
  "manual save creates exactly one post",
  "search and Maps-link paths save places",
  "accepted friend sees all posts",
  "nonfriend post GET is opaque 404",
  "friend can like, comment, and resave",
  "reshare attribution and duplicate save are stable",
  "review update changes existing post",
  "notifications become read",
  "friend removal hides feed, profile, and post",
  "reload preserves data",
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  assert.equal(typeof value, "object", `${label} must be an object`);
  assert.notEqual(value, null, `${label} must not be null`);
  return value as Record<string, unknown>;
}

function list(value: unknown, label: string): unknown[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.ok(value, `${label} must not be empty`);
  return value as string;
}

function expectStatus(
  response: AcceptanceResponse,
  status: number,
  label: string,
) {
  assert.equal(
    response.status,
    status,
    `${label}: expected ${status}, received ${response.status} ${JSON.stringify(response.body)}`,
  );
}

function required(value: string | undefined, label: string): string {
  assert.ok(value, `${label} unavailable because prerequisite failed`);
  return value;
}

async function json(
  client: AcceptanceClient,
  path: string,
  init?: RequestInit,
) {
  return client.request(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

export function seedDemoUsers() {
  const windows = process.platform === "win32";
  const result = spawnSync(
    windows ? process.env.ComSpec ?? "cmd.exe" : "npm",
    windows
      ? ["/d", "/s", "/c", "npm run seed:demo"]
      : ["run", "seed:demo"],
    {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ALLOW_DEMO_SEED: "1" },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `npm run seed:demo failed\n${result.error ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  const verified = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("Verified credential sign-ins:"));
  console.log(verified ?? "Verified credential sign-ins: unknown");
}

export async function prepareAcceptanceDatabase(prisma: PrismaClient) {
  const users = await prisma.user.findMany({
    where: { email: { in: demoUsers.map(({ email }) => email) } },
    select: { id: true, email: true },
  });
  assert.equal(users.length, demoUsers.length, "demo user count");
  const byEmail = new Map(users.map((user) => [user.email, user]));
  const alice = byEmail.get(demoUsers[0].email);
  const bob = byEmail.get(demoUsers[1].email);
  const carol = byEmail.get(demoUsers[2].email);
  assert.ok(alice && bob && carol, "all demo users must exist");

  await prisma.friendship.deleteMany({
    where: { pairKey: friendPairKey(alice.id, bob.id) },
  });
  await prisma.place.upsert({
    where: {
      externalSource_externalPlaceId: {
        externalSource: "acceptance",
        externalPlaceId: "search-bistro",
      },
    },
    update: {
      name: "Acceptance Harness Search Bistro",
      normalizedName: "acceptance harness search bistro",
      address: "2 Acceptance Way",
      normalizedAddress: "2 acceptance way",
      area: "Test District",
    },
    create: {
      name: "Acceptance Harness Search Bistro",
      normalizedName: "acceptance harness search bistro",
      address: "2 Acceptance Way",
      normalizedAddress: "2 acceptance way",
      area: "Test District",
      externalSource: "acceptance",
      externalPlaceId: "search-bistro",
    },
  });

  return {
    alice: { id: alice.id },
    bob: { id: bob.id },
    carol: { id: carol.id },
  };
}

export async function runAcceptance(
  prisma: PrismaClient,
  clients: {
    alice: AcceptanceClient;
    bob: AcceptanceClient;
    carol: AcceptanceClient;
  },
) {
  const state: RuntimeState = {
    users: await prepareAcceptanceDatabase(prisma),
  };
  const results: Array<{ name: string; error?: string }> = [];

  async function criterion(index: number, operation: () => Promise<void>) {
    const name = criterionNames[index - 1];
    try {
      await operation();
      results.push({ name });
      console.log(`PASS ${index}/12 ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, error: message });
      console.error(`FAIL ${index}/12 ${name}: ${message}`);
    }
  }

  await criterion(1, async () => {
    for (const key of ["alice", "bob", "carol"] as const) {
      const response = await json(clients[key], "/api/auth/get-session");
      expectStatus(response, 200, `${key} session`);
      assert.equal(
        record(record(response.body, `${key} session`).user, `${key} user`).id,
        state.users[key].id,
      );
    }
  });

  await criterion(2, async () => {
    const created = await json(clients.alice, "/api/friends", {
      method: "POST",
      body: JSON.stringify({ addresseeId: state.users.bob.id }),
    });
    expectStatus(created, 201, "send friend request");
    state.friendshipId = text(
      record(record(created.body, "friend response").friendship, "friendship")
        .id,
      "friendship id",
    );

    const incoming = await json(clients.bob, "/api/friends");
    expectStatus(incoming, 200, "list incoming requests");
    assert.ok(
      list(record(incoming.body, "friend lists").incoming, "incoming").some(
        (item) => record(item, "incoming item").id === state.friendshipId,
      ),
      "Bob incoming list must contain Alice request",
    );

    const accepted = await json(
      clients.bob,
      `/api/friends/${state.friendshipId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "accept" }),
      },
    );
    expectStatus(accepted, 200, "accept friend request");
    assert.equal(
      (
        await prisma.friendship.findUnique({
          where: { id: state.friendshipId },
          select: { status: true },
        })
      )?.status,
      "ACCEPTED",
    );
  });

  await criterion(3, async () => {
    const response = await json(clients.alice, "/api/saved", {
      method: "POST",
      body: JSON.stringify({
        place: {
          type: "manual",
          name: "Acceptance Manual Cafe",
          address: "1 Acceptance Way",
        },
        rating: 4,
        review: "Initial acceptance review",
        tags: ["manual"],
        images: [],
        status: "SAVED",
      }),
    });
    expectStatus(response, 200, "manual save");
    const body = record(response.body, "manual save response");
    const savedPlace = record(body.savedPlace, "manual saved place");
    const post = record(body.post, "manual post");
    state.manualSavedId = text(savedPlace.id, "manual saved place id");
    state.manualPlaceId = text(savedPlace.placeId, "manual place id");
    state.manualPostId = text(post.id, "manual post id");
    assert.equal(
      await prisma.post.count({
        where: { savedPlaceId: state.manualSavedId },
      }),
      1,
    );
  });

  await criterion(4, async () => {
    const search = await json(
      clients.alice,
      "/api/places/search?q=Acceptance%20Harness%20Search",
    );
    expectStatus(search, 200, "local search");
    const candidate = list(
      record(search.body, "search response").candidates,
      "search candidates",
    ).find(
      (item) =>
        record(item, "search candidate").name ===
        "Acceptance Harness Search Bistro",
    );
    assert.ok(candidate, "local acceptance candidate must be returned");

    const searchSave = await json(clients.alice, "/api/saved", {
      method: "POST",
      body: JSON.stringify({
        place: { type: "search", candidate },
        rating: null,
        review: null,
        tags: ["search"],
        images: [],
        status: "SAVED",
      }),
    });
    expectStatus(searchSave, 200, "search result save");
    state.searchPostId = text(
      record(record(searchSave.body, "search save").post, "search post").id,
      "search post id",
    );

    const resolved = await json(clients.alice, "/api/places/resolve", {
      method: "POST",
      body: JSON.stringify({
        type: "mapsUrl",
        url: "https://www.google.com/maps/place/Acceptance+Maps+Cafe",
      }),
    });
    expectStatus(resolved, 200, "Maps-link resolve");
    const fallback = record(resolved.body, "Maps fallback");
    assert.equal(fallback.requiresConfirmation, true);
    assert.equal(record(fallback.place, "Maps fallback place").name, "Acceptance Maps Cafe");

    const mapsSave = await json(clients.alice, "/api/saved", {
      method: "POST",
      body: JSON.stringify({
        place: {
          type: "manual",
          name: "Acceptance Maps Cafe",
          address: "3 Acceptance Way",
        },
        rating: null,
        review: null,
        tags: ["maps"],
        images: [],
        status: "SAVED",
      }),
    });
    expectStatus(mapsSave, 200, "Maps fallback save");
    state.mapsPostId = text(
      record(record(mapsSave.body, "Maps save").post, "Maps post").id,
      "Maps post id",
    );
  });

  await criterion(5, async () => {
    const feed = await json(clients.bob, "/api/feed");
    expectStatus(feed, 200, "Bob feed");
    const ids = new Set(
      list(record(feed.body, "Bob feed").items, "Bob feed items").map(
        (item) => record(item, "feed item").id,
      ),
    );
    for (const id of [
      required(state.manualPostId, "manual post"),
      required(state.searchPostId, "search post"),
      required(state.mapsPostId, "Maps post"),
    ]) {
      assert.ok(ids.has(id), `Bob feed missing Alice post ${id}`);
    }

    const manualSearch = await json(
      clients.bob,
      "/api/places/search?q=Acceptance%20Manual%20Cafe",
    );
    expectStatus(manualSearch, 200, "accepted friend manual search");
    assert.ok(
      list(
        record(manualSearch.body, "accepted friend search").candidates,
        "accepted friend candidates",
      ).some(
        (item) =>
          record(item, "accepted friend candidate").id === state.manualPlaceId,
      ),
      "accepted friend must find manual place",
    );
    expectStatus(
      await clients.bob.request(
        `/places/${required(state.manualPlaceId, "manual place")}`,
      ),
      200,
      "accepted friend manual detail",
    );
  });

  await criterion(6, async () => {
    for (const label of ["stranger", "pending"] as const) {
      const search = await json(
        clients.carol,
        "/api/places/search?q=Acceptance%20Manual%20Cafe",
      );
      expectStatus(search, 200, `${label} manual search`);
      assert.equal(
        list(
          record(search.body, `${label} search`).candidates,
          `${label} candidates`,
        ).some(
          (item) =>
            record(item, `${label} candidate`).id === state.manualPlaceId,
        ),
        false,
        `${label} must not find manual place`,
      );
      expectStatus(
        await clients.carol.request(
          `/places/${required(state.manualPlaceId, "manual place")}`,
        ),
        404,
        `${label} manual detail`,
      );

      if (label === "stranger") {
        const pending = await json(clients.alice, "/api/friends", {
          method: "POST",
          body: JSON.stringify({ addresseeId: state.users.carol.id }),
        });
        expectStatus(pending, 201, "create pending Carol friendship");
      }
    }

    const response = await json(
      clients.carol,
      `/api/posts/${required(state.manualPostId, "manual post")}`,
    );
    expectStatus(response, 404, "Carol post GET");
    assert.deepEqual(response.body, { error: "Post not found" });

    for (const method of ["PATCH", "DELETE"]) {
      const unauthorized = await json(
        clients.carol,
        `/api/saved/${required(state.manualSavedId, "manual saved place")}`,
        {
          method,
          ...(method === "PATCH"
            ? { body: JSON.stringify({ status: "VISITED" }) }
            : {}),
        },
      );
      expectStatus(unauthorized, 404, `Carol saved ${method}`);
      assert.deepEqual(unauthorized.body, {
        error: "Saved place not found",
      });
    }
  });

  await criterion(7, async () => {
    const postId = required(state.manualPostId, "manual post");
    const like = await json(clients.bob, `/api/posts/${postId}/like`, {
      method: "POST",
      body: JSON.stringify({ liked: true }),
    });
    expectStatus(like, 200, "like");
    assert.equal(record(like.body, "like response").liked, true);

    const comment = await json(
      clients.bob,
      `/api/posts/${postId}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: "Acceptance browser comment" }),
      },
    );
    expectStatus(comment, 200, "comment");

    const save = await json(clients.bob, `/api/posts/${postId}/save`, {
      method: "POST",
    });
    expectStatus(save, 200, "resave");
    const saveBody = record(save.body, "resave response");
    state.bobSavedId = text(
      record(saveBody.savedPlace, "Bob saved place").id,
      "Bob saved place id",
    );
    state.bobPostId = text(
      record(saveBody.post, "Bob post").id,
      "Bob post id",
    );

    assert.equal(
      await prisma.postLike.count({
        where: { postId, userId: state.users.bob.id },
      }),
      1,
    );
    assert.equal(
      await prisma.comment.count({
        where: {
          postId,
          authorId: state.users.bob.id,
          deletedAt: null,
        },
      }),
      1,
    );
  });

  await criterion(8, async () => {
    const postId = required(state.manualPostId, "manual post");
    const duplicate = await json(
      clients.bob,
      `/api/posts/${postId}/save`,
      { method: "POST" },
    );
    expectStatus(duplicate, 200, "duplicate resave");
    const body = record(duplicate.body, "duplicate resave");
    assert.equal(
      record(body.savedPlace, "duplicate saved place").id,
      state.bobSavedId,
    );
    assert.equal(record(body.post, "duplicate post").id, state.bobPostId);

    const saved = await prisma.userSavedPlace.findUnique({
      where: { id: required(state.bobSavedId, "Bob saved place") },
      include: { post: true },
    });
    assert.equal(saved?.sourcePostId, postId);
    assert.equal(saved?.post?.sourcePostId, postId);
    assert.equal(
      await prisma.userSavedPlace.count({
        where: {
          userId: state.users.bob.id,
          placeId: required(state.manualPlaceId, "manual place"),
        },
      }),
      1,
    );
  });

  await criterion(9, async () => {
    const response = await json(
      clients.alice,
      `/api/saved/${required(state.manualSavedId, "manual saved place")}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          rating: 5,
          review: "Updated acceptance review",
          status: "VISITED",
        }),
      },
    );
    expectStatus(response, 200, "review update");
    const detail = await json(
      clients.bob,
      `/api/posts/${required(state.manualPostId, "manual post")}`,
    );
    expectStatus(detail, 200, "friend post detail after update");
    const savedPlace = record(
      record(record(detail.body, "post detail").post, "post").savedPlace,
      "saved place",
    );
    assert.equal(savedPlace.rating, 5);
    assert.equal(savedPlace.review, "Updated acceptance review");
    assert.equal(savedPlace.status, "VISITED");
    assert.equal(
      await prisma.post.count({
        where: { savedPlaceId: state.manualSavedId },
      }),
      1,
    );
  });

  await criterion(10, async () => {
    const before = await json(clients.alice, "/api/notifications");
    expectStatus(before, 200, "notifications");
    const notifications = list(
      record(before.body, "notifications response").notifications,
      "notifications",
    );
    const types = new Set(
      notifications.map((item) => record(item, "notification").type),
    );
    for (const type of ["FRIEND_ACCEPTED", "POST_LIKED", "POST_COMMENTED"]) {
      assert.ok(types.has(type), `missing ${type} notification`);
    }

    const read = await json(clients.alice, "/api/notifications/read", {
      method: "PATCH",
      body: JSON.stringify({ all: true }),
    });
    expectStatus(read, 200, "mark notifications read");
    assert.ok(
      Number(record(read.body, "read response").updated) >= 3,
      "expected at least three updated notifications",
    );

    const after = await json(clients.alice, "/api/notifications");
    expectStatus(after, 200, "notifications after read");
    assert.ok(
      list(
        record(after.body, "notifications after read").notifications,
        "notifications after read",
      ).every((item) => record(item, "notification").readAt !== null),
      "all notifications must be read",
    );
  });

  await criterion(11, async () => {
    const removeOwnSave = await json(
      clients.bob,
      `/api/saved/${required(state.bobSavedId, "Bob saved place")}`,
      { method: "DELETE" },
    );
    expectStatus(removeOwnSave, 204, "remove Bob manual save");
    assert.equal(
      await prisma.userSavedPlace.count({
        where: {
          userId: state.users.bob.id,
          placeId: required(state.manualPlaceId, "manual place"),
        },
      }),
      0,
    );

    const response = await json(
      clients.bob,
      `/api/friends/${required(state.friendshipId, "friendship")}`,
      { method: "DELETE" },
    );
    expectStatus(response, 204, "remove friendship");

    const feed = await json(clients.bob, "/api/feed");
    expectStatus(feed, 200, "Bob feed after removal");
    assert.ok(
      list(record(feed.body, "Bob feed after removal").items, "feed items")
        .every(
          (item) =>
            record(record(item, "feed item").author, "feed author").id !==
            state.users.alice.id,
        ),
      "Alice posts must disappear from Bob feed",
    );

    for (const [client, username] of [
      [clients.bob, demoUsers[0].username],
      [clients.alice, demoUsers[1].username],
    ] as const) {
      const profile = await json(
        client,
        `/api/profile?username=${encodeURIComponent(username)}`,
      );
      expectStatus(profile, 404, `removed friend profile ${username}`);
    }

    const post = await json(
      clients.bob,
      `/api/posts/${required(state.manualPostId, "manual post")}`,
    );
    expectStatus(post, 404, "removed friend post GET");
    assert.deepEqual(post.body, { error: "Post not found" });

    const removedSearch = await json(
      clients.bob,
      "/api/places/search?q=Acceptance%20Manual%20Cafe",
    );
    expectStatus(removedSearch, 200, "removed friend manual search");
    assert.equal(
      list(
        record(removedSearch.body, "removed friend search").candidates,
        "removed friend candidates",
      ).some(
        (item) =>
          record(item, "removed friend candidate").id === state.manualPlaceId,
      ),
      false,
    );
    expectStatus(
      await clients.bob.request(
        `/places/${required(state.manualPlaceId, "manual place")}`,
      ),
      404,
      "removed friend manual detail",
    );
    assert.equal(
      await prisma.friendship.count({
        where: {
          pairKey: friendPairKey(state.users.alice.id, state.users.bob.id),
        },
      }),
      0,
    );
  });

  await criterion(12, async () => {
    const feed = await json(clients.alice, "/api/feed");
    expectStatus(feed, 200, "Alice feed reload");
    const ids = new Set(
      list(record(feed.body, "Alice reload feed").items, "reload items").map(
        (item) => record(item, "reload item").id,
      ),
    );
    assert.ok(ids.has(required(state.manualPostId, "manual post")));
    const persisted = await prisma.userSavedPlace.findUnique({
      where: { id: required(state.manualSavedId, "manual saved place") },
      include: { post: true },
    });
    assert.equal(persisted?.rating, 5);
    assert.equal(persisted?.review, "Updated acceptance review");
    assert.equal(persisted?.status, "VISITED");
    assert.equal(persisted?.post?.id, state.manualPostId);
  });

  const failures = results.filter(({ error }) => error);
  console.log(
    `Acceptance total: ${results.length - failures.length} PASS, ${failures.length} FAIL`,
  );
  if (failures.length > 0) process.exitCode = 1;
  return { results, state };
}

export { demoUsers };

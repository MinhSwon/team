import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { markNotificationsRead } from "./interactions";
import { searchPlaces, type CanonicalPlaceData, type PlaceStore } from "./places";
import {
  PostError,
  parseSavePlaceInput,
  parseSavedPlaceUpdate,
} from "./posts";

const root = new URL("../../", import.meta.url);

function source(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

test("baseline migration blocks mapped legacy tables before social tables", () => {
  const sql = source(
    "prisma/migrations/20260808000000_init/migration.sql",
  );
  const abort = sql.indexOf("fresh-install-only");
  const firstSocialTable = sql.indexOf('CREATE TABLE "User"');

  assert.ok(abort >= 0, "baseline needs explicit legacy-table abort");
  assert.ok(abort < firstSocialTable, "legacy abort must run before social tables");
  for (const table of [
    "users",
    "places",
    "user_saved_places",
    "groups",
    "group_saved_places",
    "import_batches",
    "import_candidates",
  ]) {
    assert.match(sql, new RegExp(`'${table}'`));
  }
});

test("migration and root docs declare fresh-install-only rollout", () => {
  for (const path of ["README.md", "prisma/migrations/README.md"]) {
    const markdown = source(path);
    assert.match(markdown, /in-place legacy upgrade is unsupported/i, path);
    assert.match(markdown, /new database/i, path);
    assert.match(markdown, /export/i, path);
    assert.match(markdown, /fresh-install-only/i, path);
    assert.match(
      markdown,
      /already exactly match(?:es|ing)\s+the\s+social schema/i,
      path,
    );
  }
});

test("final migration defines saved status, rate buckets, and blob lifecycle", () => {
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /enum SavedPlaceStatus[\s\S]*SAVED[\s\S]*WANT_TO_GO[\s\S]*VISITED/);
  assert.match(schema, /status\s+SavedPlaceStatus\s+@default\(SAVED\)/);
  assert.match(schema, /model RateLimitBucket/);
  assert.match(schema, /model BlobUpload/);
  assert.match(schema, /enum BlobLifecycle[\s\S]*UPLOADED[\s\S]*CLAIMED[\s\S]*PENDING_DELETE/);

  const migrations = source("package.json");
  assert.match(migrations, /verify:migrations/);
  assert.match(migrations, /cleanup:blobs/);
});

test("database module fails fast when DATABASE_URL is absent", () => {
  const command = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      "import('./src/lib/db.ts')",
    ],
    {
      cwd: new URL(".", root),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    },
  );

  assert.notEqual(command.status, 0);
  assert.match(
    `${command.stdout}\n${command.stderr}`,
    /DATABASE_URL is required/,
  );
});

test("demo seed requires explicit opt-in and refuses production", () => {
  const run = (env: NodeJS.ProcessEnv) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/seed-demo.ts"], {
      cwd: new URL(".", root),
      encoding: "utf8",
      env: { ...process.env, ...env },
    });

  const noFlag = run({ ALLOW_DEMO_SEED: "", NODE_ENV: "development" });
  assert.notEqual(noFlag.status, 0);
  assert.match(`${noFlag.stdout}\n${noFlag.stderr}`, /ALLOW_DEMO_SEED=1/);

  const production = run({ ALLOW_DEMO_SEED: "1", NODE_ENV: "production" });
  assert.notEqual(production.status, 0);
  assert.match(`${production.stdout}\n${production.stderr}`, /production/i);
});

test("rate limiter uses documented conservative policies and atomic store result", async () => {
  const modulePath = "./rate-limit";
  const rateLimits = await import(modulePath).catch(() => null);
  assert.ok(rateLimits, "rate-limit module must exist");
  assert.deepEqual(rateLimits.RATE_LIMITS, {
    userSearch: { limit: 30, windowSeconds: 60, includeIp: true },
    placeSearch: { limit: 20, windowSeconds: 60, includeIp: true },
    friendRequest: { limit: 10, windowSeconds: 3600, includeIp: true },
    comment: { limit: 20, windowSeconds: 60, includeIp: true },
    upload: { limit: 10, windowSeconds: 3600, includeIp: true },
  });

  let count = 0;
  const now = new Date("2026-08-09T00:00:00.000Z");
  const store = {
    consume: async () => ({
      count: ++count,
      resetAt: new Date(now.getTime() + 60_000),
    }),
  };
  await rateLimits.consumeRateLimit("test", { limit: 1, windowSeconds: 60 }, store, now);
  await assert.rejects(
    rateLimits.consumeRateLimit("test", { limit: 1, windowSeconds: 60 }, store, now),
    (error: unknown) =>
      error instanceof rateLimits.RateLimitError &&
      (error as { status: number }).status === 429 &&
      (error as { retryAfter: number }).retryAfter === 60,
  );
});

test("serializable write conflicts retry at most three attempts", async () => {
  const modulePath = "./serializable";
  const serializable = await import(modulePath).catch(() => null);
  assert.ok(serializable, "serializable module must exist");

  let attempts = 0;
  const result = await serializable.withSerializableRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw { code: "P2034" };
    return "committed";
  });
  assert.equal(result, "committed");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    serializable.withSerializableRetry(async () => {
      attempts += 1;
      throw { code: "P2034" };
    }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034",
  );
  assert.equal(attempts, 3);
});

test("Blob cleanup retains failures and removes successful or expired records", async () => {
  const modulePath = "./blob-uploads";
  const blobs = await import(modulePath).catch(() => null);
  assert.ok(blobs, "blob-uploads module must exist");

  const removed: string[] = [];
  const pending: string[] = [];
  const candidates = [
    {
      id: "pending-success",
      url: "https://blob.example/success.webp",
      lifecycle: "PENDING_DELETE",
      createdAt: new Date("2026-08-09T00:00:00.000Z"),
    },
    {
      id: "pending-failure",
      url: "https://blob.example/failure.webp",
      lifecycle: "PENDING_DELETE",
      createdAt: new Date("2026-08-09T00:00:00.000Z"),
    },
    {
      id: "expired-upload",
      url: "https://blob.example/orphan.webp",
      lifecycle: "UPLOADED",
      createdAt: new Date("2026-08-07T00:00:00.000Z"),
    },
  ];
  const result = await blobs.cleanupBlobUploads({
    now: new Date("2026-08-09T12:00:00.000Z"),
    store: {
      listCleanupCandidates: async () => candidates,
      markPendingDelete: async (id: string) => {
        pending.push(id);
        return true;
      },
      deleteRecord: async (id: string) => {
        removed.push(id);
      },
    },
    del: async (url: string) => {
      if (url.includes("failure")) throw new Error("provider failed");
    },
  });

  assert.deepEqual(pending, ["pending-success", "pending-failure", "expired-upload"]);
  assert.deepEqual(removed, ["pending-success", "expired-upload"]);
  assert.deepEqual(result, { deleted: 2, failed: 1 });
});

test("Blob cleanup starts independent provider deletes concurrently", async () => {
  const blobs = await import("./blob-uploads");
  let started = 0;
  let startedAtRelease = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const candidates = ["one", "two", "three"].map((id) => ({
    id,
    url: `https://blob.example/${id}.webp`,
    lifecycle: "PENDING_DELETE" as const,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
  }));
  const timer = setTimeout(() => {
    startedAtRelease = started;
    release();
  }, 20);

  const result = await blobs.cleanupBlobUploads({
    store: {
      listCleanupCandidates: async () => candidates,
      markPendingDelete: async () => true,
      deleteRecord: async () => {},
    },
    del: async () => {
      started += 1;
      await gate;
    },
  });
  clearTimeout(timer);

  assert.equal(startedAtRelease, candidates.length);
  assert.deepEqual(result, { deleted: candidates.length, failed: 0 });
});

test("manual local search receives viewer identity", async () => {
  type ViewerStore = PlaceStore & { seenViewer?: string };
  const store: ViewerStore = {
    findById: async () => null,
    findByExternal: async () => null,
    create: async () => {
      throw new Error("not used");
    },
    upsertManual: async () => {
      throw new Error("not used");
    },
    searchLocal: async (_query: string, viewerId?: string) => {
      store.seenViewer = viewerId;
      return [];
    },
  };

  await searchPlaces("private", { store, apiKey: "", viewerId: "viewer-1" } as never);
  assert.equal(store.seenViewer, "viewer-1");
});

test("provider fetches carry a timeout signal", async () => {
  let signal: AbortSignal | null | undefined;
  const store: PlaceStore = {
    findById: async () => null,
    findByExternal: async () => null,
    searchLocal: async () => [],
    create: async (data: CanonicalPlaceData) => ({
      id: "place-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }),
    upsertManual: async () => {
      throw new Error("not used");
    },
  };
  await searchPlaces("provider", {
    apiKey: "key",
    store,
    fetch: async (_input, init) => {
      signal = init?.signal;
      return Response.json({ places: [] });
    },
  });
  assert.ok(signal instanceof AbortSignal);
});

test("save trust boundary enforces tag and image quotas", () => {
  const base = {
    place: { type: "manual", name: "Cafe", address: "1 Main" },
    rating: null,
    review: null,
    images: [],
  };

  assert.throws(
    () => parseSavePlaceInput({ ...base, tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`) }),
    /10/,
  );
  assert.throws(
    () => parseSavePlaceInput({ ...base, tags: ["x".repeat(33)] }),
    /32/,
  );
  assert.throws(
    () =>
      parseSavePlaceInput({
        ...base,
        tags: [],
        images: Array.from({ length: 7 }, (_, index) => ({
          uploadId: `upload-${index}`,
        })),
      }),
    /6/,
  );
});

test("saved-place status defaults and validates on create and update", () => {
  const base = {
    place: {
      type: "manual",
      name: "Status Cafe",
      address: "1 Status Way",
    },
  };

  assert.equal(parseSavePlaceInput(base).status, "SAVED");
  for (const status of ["SAVED", "WANT_TO_GO", "VISITED"] as const) {
    assert.equal(parseSavePlaceInput({ ...base, status }).status, status);
    assert.equal(parseSavedPlaceUpdate({ status }).status, status);
  }
  for (const status of ["visited", "", null, 1]) {
    assert.throws(
      () => parseSavePlaceInput({ ...base, status }),
      (error: unknown) =>
        error instanceof PostError &&
        error.code === "INVALID_INPUT" &&
        error.message === "Invalid saved place status",
    );
    assert.throws(
      () => parseSavedPlaceUpdate({ status }),
      (error: unknown) =>
        error instanceof PostError &&
        error.code === "INVALID_INPUT" &&
        error.message === "Invalid saved place status",
    );
  }
});

test("live PostgreSQL race proof is registered", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const script = readFileSync(
    new URL("../../scripts/verify-races.ts", import.meta.url),
    "utf8",
  );

  assert.equal(packageJson.scripts?.["verify:races"], "tsx scripts/verify-races.ts");
  assert.match(script, /Serializable/);
  assert.match(script, /P2034/);
  assert.match(script, /Post not found/);
});

test("notification read IDs are capped at 100", async () => {
  await assert.rejects(
    markNotificationsRead(
      "user-1",
      { ids: Array.from({ length: 101 }, (_, index) => `notification-${index}`) },
      {
        transaction: async <T>(
          operation: (store: never) => Promise<T>,
        ) => operation({} as never),
        findLike: async () => null,
        countLikes: async () => 0,
        findResaveSource: async () => null,
        countReshares: async () => 0,
        listNotifications: async () => [],
      },
    ),
    /100/,
  );
});

test("profile, saved authorization, and interaction writes use race-safe queries", () => {
  const profiles = source("src/lib/profiles.ts");
  assert.match(profiles, /findVisibleProfile/);
  assert.doesNotMatch(profiles, /findFriendshipByPairKey[\s\S]*findPostsByAuthor/);

  const posts = source("src/lib/posts.ts");
  assert.match(posts, /findOwnedSavedPlace/);
  assert.doesNotMatch(posts, /"FORBIDDEN"/);

  const interactions = source("src/lib/interactions.ts");
  assert.match(interactions, /Serializable/);
  assert.match(interactions, /MAX_SERIALIZABLE_ATTEMPTS/);
  assert.match(source("src/lib/serializable.ts"), /P2034/);
});

test("saved and place-detail UI expose visible workflow controls", () => {
  const add = source("src/components/AddPlaceModal.tsx");
  assert.doesNotMatch(add, /role="tab(?:list)?"/);
  assert.doesNotMatch(add, /aria-selected=/);

  const saved = source("src/app/(app)/saved/page.tsx");
  assert.match(saved, /SavedPlacesClient/);
  const savedClientPath = new URL(
    "src/components/SavedPlacesClient.tsx",
    root,
  );
  assert.equal(existsSync(savedClientPath), true);
  const savedClient = readFileSync(savedClientPath, "utf8");
  assert.match(savedClient, /Search saved places/);
  assert.match(savedClient, /Status filter/);
  assert.match(savedClient, /Edit/);
  assert.match(savedClient, /Remove/);

  const detail = source("src/app/(app)/places/[id]/page.tsx");
  assert.match(detail, /SavedPlaceEditor/);
  const editorPath = new URL("src/components/SavedPlaceEditor.tsx", root);
  assert.equal(existsSync(editorPath), true);
  const editor = readFileSync(editorPath, "utf8");
  assert.match(editor, /Save place/);
  assert.match(editor, /Update save/);
  assert.match(editor, /Remove save/);
  assert.match(editor, /WANT_TO_GO/);
  assert.doesNotMatch(detail, /href="\/add"/);
});

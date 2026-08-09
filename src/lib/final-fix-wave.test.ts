import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
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
  assert.match(
    schema,
    /enum BlobLifecycle[\s\S]*RESERVED[\s\S]*UPLOADED[\s\S]*CLAIMED[\s\S]*PENDING_PRIVATE_COPY[\s\S]*CONVERTING[\s\S]*PENDING_PUBLIC_DELETE[\s\S]*PENDING_DELETE[\s\S]*DELETING/,
  );
  assert.match(schema, /sourceUrl\s+String\?\s+@unique/);
  assert.match(schema, /leaseUntil\s+DateTime\?/);
  assert.match(schema, /blobUploadId\s+String\s+@unique/);
  assert.match(
    schema,
    /blobUpload\s+BlobUpload\s+@relation\(fields: \[blobUploadId\],[\s\S]*onDelete: Restrict\)/,
  );

  const migrations = source("package.json");
  assert.match(migrations, /verify:migrations/);
  assert.match(migrations, /cleanup:blobs/);
  assert.match(migrations, /cleanup:rate-limits/);
});

test("private Blob migration backfills exact ownership and blocks unsupported URLs", () => {
  const enumSql = source(
    "prisma/migrations/20260809010000_private_blob_lifecycle_enum/migration.sql",
  );
  const sql = source(
    "prisma/migrations/20260809011000_private_blob_media/migration.sql",
  );
  assert.match(enumSql, /Unsupported or foreign SavedPlaceImage URL/);
  assert.match(enumSql, /ADD VALUE IF NOT EXISTS 'RESERVED'/);
  assert.doesNotMatch(enumSql, /'RESERVED'::"BlobLifecycle"/);
  const unsupportedAbort = sql.indexOf(
    "Unsupported or foreign SavedPlaceImage URL",
  );
  const firstMutation = Math.min(
    ...["ALTER TYPE", "ALTER TABLE", "INSERT INTO", "UPDATE "]
      .map((token) => sql.indexOf(token))
      .filter((index) => index >= 0),
  );

  assert.ok(unsupportedAbort >= 0);
  assert.ok(unsupportedAbort < firstMutation);
  assert.match(
    sql,
    /JOIN "UserSavedPlace" saved ON saved\."id" = image\."savedPlaceId"/,
  );
  assert.match(sql, /saved\."userId"/);
  assert.match(sql, /legacy_blob_store_hosts/);
  assert.match(sql, /PENDING_PRIVATE_COPY/);
  assert.doesNotMatch(sql, /THEN 'CLAIMED'::"BlobLifecycle"/);
  assert.match(sql, /'\/api\/media\/' \|\| image\."blobUploadId"/);
  assert.match(sql, /ALTER COLUMN "blobUploadId" SET NOT NULL/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test("migration verifier executes private, public, and unsupported image proofs", () => {
  const verifier = source("scripts/verify-migrations.ts");

  assert.match(
    verifier,
    /PASS private Blob image backfills exact owner and pending verified conversion/,
  );
  assert.match(verifier, /PASS public Blob image enters durable private-copy ledger/);
  assert.match(verifier, /PASS unsupported external image aborts before schema or data mutation/);
  assert.match(verifier, /PENDING_PRIVATE_COPY/);
  assert.match(verifier, /\/api\/media\//);
  assert.match(verifier, /information_schema\.columns/);
});

test("HTML and API serializers never expose raw Blob provider URLs", () => {
  const uploads = source("src/app/api/uploads/route.ts");
  const blobUploads = source("src/lib/blob-uploads.ts");
  const posts = source("src/lib/posts.ts");
  const profiles = source("src/lib/profiles.ts");

  assert.match(blobUploads, /mediaUrl/);
  assert.doesNotMatch(uploads, /Response\.json\(blob/);
  assert.match(posts, /url:\s*mediaUrl\(upload\.id\)/);
  assert.match(profiles, /mediaUrl/);
  assert.doesNotMatch(profiles, /select:\s*\{\s*url:\s*true\s*\}/);
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

test("acceptance harness isolates persistent IP rate-limit buckets", async () => {
  const support = (await import("../../scripts/acceptance-support")) as {
    createAcceptanceIp?: () => string;
  };
  const createAcceptanceIp = support.createAcceptanceIp;
  assert.ok(createAcceptanceIp);
  const first = createAcceptanceIp();
  const second = createAcceptanceIp();
  assert.equal(isIP(first), 6);
  assert.equal(isIP(second), 6);
  assert.notEqual(first, second);
  assert.match(source("scripts/acceptance-social.ts"), /x-forwarded-for/);
  assert.match(source("scripts/acceptance-browser.ts"), /extraHTTPHeaders/);
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
  const released: string[] = [];
  const candidates = [
    {
      id: "pending-success",
      url: "https://blob.example/success.webp",
      sourceUrl: null,
      pathname: "places/user/success.webp",
      lifecycle: "PENDING_DELETE",
      createdAt: new Date("2026-08-09T00:00:00.000Z"),
      leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
    },
    {
      id: "pending-failure",
      url: "https://blob.example/failure.webp",
      sourceUrl: null,
      pathname: "places/user/failure.webp",
      lifecycle: "PENDING_DELETE",
      createdAt: new Date("2026-08-09T00:00:00.000Z"),
      leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
    },
    {
      id: "expired-upload",
      url: "https://blob.example/orphan.webp",
      sourceUrl: null,
      pathname: "places/user/orphan.webp",
      lifecycle: "UPLOADED",
      createdAt: new Date("2026-08-07T00:00:00.000Z"),
      leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
    },
  ];
  const result = await blobs.cleanupBlobUploads({
    now: new Date("2026-08-09T12:00:00.000Z"),
    store: {
      claimCleanupCandidates: async () => candidates,
      releaseDeleteClaim: async (id: string) => {
        released.push(id);
      },
      deleteClaimedRecord: async (id: string) => {
        removed.push(id);
        return true;
      },
    },
    del: async (url: string) => {
      if (url.includes("failure")) throw new Error("provider failed");
    },
  });

  assert.deepEqual(removed, ["pending-success", "expired-upload"]);
  assert.deepEqual(released, ["pending-failure"]);
  assert.deepEqual(result, { deleted: 2, failed: 1 });
});

test("Blob cleanup claims work once and recovers stale deletion leases", async () => {
  const blobs = await import("./blob-uploads");
  assert.equal(
    typeof blobs.cleanupBlobUploads,
    "function",
  );

  const candidate = {
    id: "pending",
    url: "https://store.private.blob.vercel-storage.com/pending.webp",
    sourceUrl: null,
    pathname: "places/user/pending.webp",
    contentType: "image/webp" as const,
    lifecycle: "DELETING" as const,
    createdAt: new Date("2026-08-08T00:00:00.000Z"),
    leaseUntil: new Date("2026-08-09T10:00:00.000Z"),
  };
  let claimed = false;
  let deletes = 0;
  const store = {
    claimCleanupCandidates: async (
      now: Date,
      _orphanCutoff: Date,
      leaseUntil: Date,
    ) => {
      if (claimed || candidate.leaseUntil >= now) return [];
      claimed = true;
      return [{ ...candidate, leaseUntil }];
    },
    deleteClaimedRecord: async () => true,
    releaseDeleteClaim: async () => {},
  };
  const run = () =>
    blobs.cleanupBlobUploads({
      now: new Date("2026-08-09T12:00:00.000Z"),
      store,
      del: async () => {
        deletes += 1;
      },
    });

  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(deletes, 1);
  assert.equal(first.deleted + second.deleted, 1);
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
    sourceUrl: null,
    pathname: `places/user/${id}.webp`,
    contentType: "image/webp" as const,
    lifecycle: "PENDING_DELETE" as const,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
    leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
  }));
  const timer = setTimeout(() => {
    startedAtRelease = started;
    release();
  }, 20);

  const result = await blobs.cleanupBlobUploads({
    store: {
      claimCleanupCandidates: async () => candidates,
      releaseDeleteClaim: async () => {},
      deleteClaimedRecord: async () => true,
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

test("legacy public Blob conversion is durable and deletes source only after private copy", async () => {
  const blobs = await import("./blob-uploads");
  assert.equal(
    typeof blobs.convertLegacyBlobUploads,
    "function",
    "legacy Blob conversion helper must exist",
  );

  const events: string[] = [];
  let convertedUrl: string | null = null;
  const leaseUntil = new Date("2026-08-09T12:05:00.000Z");
  const result = await blobs.convertLegacyBlobUploads({
    now: new Date("2026-08-09T12:00:00.000Z"),
    store: {
      claimConversionCandidates: async () => [
        {
          id: "legacy-1",
          ownerId: "user-1",
          url: null,
          sourceUrl:
            "https://store.public.blob.vercel-storage.com/old.webp",
          pathname: "places/user-1/legacy/legacy-1.webp",
          lifecycle: "CONVERTING",
          leaseUntil,
          contentType: null,
        },
      ],
      recordPrivateCopy: async (
        _id: string,
        _lease: Date,
        blob: { url: string; pathname: string },
      ) => {
        events.push("record-private");
        convertedUrl = blob.url;
        return true;
      },
      finishConversion: async () => {
        events.push("finish");
        return true;
      },
      releaseConversionClaim: async () => {
        events.push("release");
      },
    },
    get: async (url: string, options: { access: string; useCache: boolean }) => {
      events.push(`get:${url}`);
      assert.equal(options.access, "public");
      assert.equal(options.useCache, false);
      return {
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new Uint8Array([
                0x52,
                0x49,
                0x46,
                0x46,
                0x00,
                0x00,
                0x00,
                0x00,
                0x57,
                0x45,
                0x42,
                0x50,
              ]),
            );
            controller.close();
          },
        }),
        blob: { contentType: "image/webp", size: 12 },
      };
    },
    put: async (
      pathname: string,
      _stream: Uint8Array,
      options: {
        access: string;
        addRandomSuffix: boolean;
        allowOverwrite: boolean;
      },
    ) => {
      events.push(`put:${pathname}`);
      assert.equal(options.access, "private");
      assert.equal(options.addRandomSuffix, false);
      assert.equal(options.allowOverwrite, true);
      return {
        url: "https://store.private.blob.vercel-storage.com/new.webp",
        pathname,
      };
    },
    del: async (url: string) => {
      events.push(`delete:${url}`);
    },
    token: "blob-token",
    allowedHosts: ["store.public.blob.vercel-storage.com"],
  });

  assert.equal(
    convertedUrl,
    "https://store.private.blob.vercel-storage.com/new.webp",
  );
  assert.deepEqual(events, [
    "get:https://store.public.blob.vercel-storage.com/old.webp",
    "put:places/user-1/legacy/legacy-1.webp",
    "record-private",
    "delete:https://store.public.blob.vercel-storage.com/old.webp",
    "finish",
  ]);
  assert.deepEqual(result, { converted: 1, failed: 0 });
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

test("acceptance starts a fresh isolated production server and covers registration/mobile routes", () => {
  const social = source("scripts/acceptance-social.ts");
  const browser = source("scripts/acceptance-browser.ts");
  const browserResources = source("scripts/acceptance-browser-resources.ts");
  const server = source("scripts/acceptance-server.ts");

  for (const script of [social, browser]) {
    assert.match(script, /withFreshProductionServer/);
    assert.doesNotMatch(
      script,
      /process\.env\.APP_URL\s*\?\?/,
    );
  }
  assert.match(server, /\["build"\]/);
  assert.match(server, /\[nextBin,\s*"start",\s*"-p"/);
  assert.match(server, /maxBuffer:\s*20 \* 1024 \* 1024/);
  assert.match(server, /NEXT_DIST_DIR/);
  assert.match(server, /NEXT_ACCEPTANCE_BUILD:\s*"1"/);
  assert.match(
    server,
    /const exited = new Promise<void>[\s\S]*child\.kill\("SIGTERM"\)[\s\S]*Promise\.race\(\[\s*exited,/,
  );
  assert.match(
    server,
    /process\.platform === "win32"[\s\S]*"taskkill"[\s\S]*"\/T"[\s\S]*"\/F"/,
  );
  assert.match(server, /rm\(distPath,\s*\{\s*recursive:\s*true,\s*force:\s*true/);
  assert.match(
    server,
    /join\(distPath,\s*"BUILD_ID"\)/,
  );
  const nextConfig = source("next.config.ts");
  assert.match(nextConfig, /process\.env\.NEXT_DIST_DIR/);
  assert.match(nextConfig, /process\.env\.NEXT_ACCEPTANCE_BUILD/);
  assert.match(nextConfig, /cpus:\s*2/);
  assert.match(source("eslint.config.mjs"), /\.next-acceptance\/\*\*/);
  assert.match(server, /Fresh production server:/);
  assert.match(browser, /\/register/);
  assert.match(browser, /Create account/);
  assert.doesNotMatch(browser, /import \{\s*chromium/);
  assert.match(browser, /await import\("playwright-core"\)/);
  assert.match(browser, /closeBrowserResources/);
  assert.match(
    browserResources,
    /deleteMany\(\{\s*where:\s*\{\s*email:\s*freshEmail/,
  );
  for (const route of [
    "/feed",
    "/friends",
    "/notifications",
    "/profile/",
    "/places/",
    "/saved",
    "/add",
  ]) {
    assert.match(browser, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("legacy Blob migration requires exact owned hosts and leaves all legacy media unverified", () => {
  const enumSql = source(
    "prisma/migrations/20260809010000_private_blob_lifecycle_enum/migration.sql",
  );
  const mediaSql = source(
    "prisma/migrations/20260809011000_private_blob_media/migration.sql",
  );

  assert.match(
    `${enumSql}\n${mediaSql}`,
    /current_setting\(['"]placedecide\.legacy_blob_store_hosts['"],\s*true\)/,
  );
  assert.match(
    `${enumSql}\n${mediaSql}`,
    /exact.*owned.*host|owned.*host.*exact/i,
  );
  assert.doesNotMatch(
    `${enumSql}\n${mediaSql}`,
    /\\\.[a-z0-9-]+\\\.\(public\|private\)\\\.blob\\\.vercel-storage\\\.com/,
  );
  assert.doesNotMatch(
    mediaSql,
    /THEN 'CLAIMED'::"BlobLifecycle"/,
  );
  assert.match(mediaSql, /PENDING_PRIVATE_COPY/);
  assert.match(mediaSql, /contentType/);
});

test("legacy Blob conversion rejects foreign hosts and hostile image bytes", async () => {
  const blobs = await import("./blob-uploads") as typeof import("./blob-uploads") & {
    isTrustedLegacyBlobUrl?: (
      url: string,
      allowedHosts: readonly string[],
    ) => boolean;
  };
  assert.equal(
    blobs.isTrustedLegacyBlobUrl?.(
      "https://owned.public.blob.vercel-storage.com/old.png",
      ["owned.public.blob.vercel-storage.com"],
    ),
    true,
  );
  assert.equal(
    blobs.isTrustedLegacyBlobUrl?.(
      "https://other.public.blob.vercel-storage.com/old.png",
      ["owned.public.blob.vercel-storage.com"],
    ),
    false,
  );
  assert.equal(
    blobs.isTrustedLegacyBlobUrl?.(
      "https://owned.public.blob.vercel-storage.com/old.png",
      ["OWNED.PUBLIC.BLOB.VERCEL-STORAGE.COM"],
    ),
    true,
  );

  let putCalls = 0;
  let deleteCalls = 0;
  const result = await blobs.convertLegacyBlobUploads({
    now: new Date("2026-08-09T12:00:00.000Z"),
    allowedHosts: ["owned.public.blob.vercel-storage.com"],
    store: {
      claimConversionCandidates: async () => [
        {
          id: "legacy-hostile",
          ownerId: "user-1",
          url: null,
          sourceUrl:
            "https://owned.public.blob.vercel-storage.com/old.png",
          pathname: "places/user-1/legacy/legacy-hostile.png",
          lifecycle: "CONVERTING",
          leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
          contentType: null,
        },
      ],
      recordPrivateCopy: async () => true,
      finishConversion: async () => true,
      releaseConversionClaim: async () => {},
    },
    get: async () => ({
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode("<html><script>alert(1)</script>"),
          );
          controller.close();
        },
      }),
      blob: { contentType: "image/png", size: 31 },
    }),
    put: async () => {
      putCalls += 1;
      return {
        url: "https://owned.private.blob.vercel-storage.com/new.png",
        pathname: "places/user-1/legacy/legacy-hostile.png",
      };
    },
    del: async () => {
      deleteCalls += 1;
    },
    token: "blob-token",
  } as never);

  assert.deepEqual(result, { converted: 0, failed: 1 });
  assert.equal(putCalls, 0);
  assert.equal(deleteCalls, 0);
});

test("legacy Blob conversion derives provider access from hostname only", async () => {
  const blobs = await import("./blob-uploads");
  const accesses: string[] = [];

  for (const [sourceUrl, expectedAccess] of [
    [
      "https://owned.public.blob.vercel-storage.com/folder/.private./old.png",
      "public",
    ],
    [
      "https://owned.private.blob.vercel-storage.com/old.png",
      "private",
    ],
  ] as const) {
    const leaseUntil = new Date("2026-08-09T12:05:00.000Z");
    const result = await blobs.convertLegacyBlobUploads({
      now: new Date("2026-08-09T12:00:00.000Z"),
      allowedHosts: [
        "owned.public.blob.vercel-storage.com",
        "owned.private.blob.vercel-storage.com",
      ],
      store: {
        claimConversionCandidates: async () => [
          {
            id: expectedAccess,
            ownerId: "user-1",
            url: null,
            sourceUrl,
            pathname: `places/user-1/legacy/${expectedAccess}.png`,
            lifecycle: "CONVERTING",
            leaseUntil,
            contentType: null,
          },
        ],
        recordPrivateCopy: async () => true,
        finishConversion: async () => true,
        releaseConversionClaim: async () => {},
      },
      get: async (_url, options) => {
        accesses.push(options.access);
        return {
          statusCode: 200,
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new Uint8Array([
                  0x89,
                  0x50,
                  0x4e,
                  0x47,
                  0x0d,
                  0x0a,
                  0x1a,
                  0x0a,
                ]),
              );
              controller.close();
            },
          }),
          blob: { contentType: "image/png", size: 8 },
        };
      },
      put: async (pathname) => ({
        url: `https://owned.private.blob.vercel-storage.com/${pathname}`,
        pathname,
      }),
      del: async () => {},
      token: "blob-token",
    });
    assert.deepEqual(result, { converted: 1, failed: 0 });
  }

  assert.deepEqual(accesses, ["public", "private"]);
});

test("private media uses stored trusted MIME and nosniff, never provider MIME", async () => {
  const media = await import("../app/api/media/[id]/route") as typeof import("../app/api/media/[id]/route");
  const response = await media.handleMediaRequest(
    new Request("http://localhost/api/media/upload-1"),
    "upload-1",
    {
      requireUser: async () => ({ id: "viewer-1" }),
      findVisibleUpload: async () => ({
        pathname: "places/user-1/upload-1.png",
        contentType: "image/png",
      }),
      get: async () => ({
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new Uint8Array([
                0x89,
                0x50,
                0x4e,
                0x47,
                0x0d,
                0x0a,
                0x1a,
                0x0a,
              ]),
            );
            controller.close();
          },
        }),
        blob: { contentType: "text/html", size: 8 },
      }),
      token: "blob-token",
    } as never,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("ambiguous Blob put failure retains durable reservation", async () => {
  const { handleUpload } = await import("../app/api/uploads/route");
  let cancelled = false;
  const response = await handleUpload(
    new Request("http://localhost/api/uploads", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set(
          "image",
          new File(
            [
              new Uint8Array([
                0x89,
                0x50,
                0x4e,
                0x47,
                0x0d,
                0x0a,
                0x1a,
                0x0a,
              ]),
            ],
            "place.png",
            { type: "image/png" },
          ),
        );
        return form;
      })(),
    }),
    {
      requireUser: async () => ({ id: "user-1" }),
      token: "blob-token",
      reserveUpload: async (_ownerId: string, pathname: string) => ({
        id: "upload-1",
        pathname,
      }),
      put: async () => {
        throw new Error("provider response ambiguous");
      },
      completeUpload: async () => {
        throw new Error("unreachable");
      },
      cancelReservation: async () => {
        cancelled = true;
      },
      queueDeletion: async () => {},
      del: async () => {},
      rateLimit: async () => {},
    } as never,
  );

  assert.equal(response.status, 502);
  assert.equal(cancelled, false);
});

test("cleanup treats missing provider objects as idempotent success", async () => {
  const blobs = await import("./blob-uploads");
  const result = await blobs.cleanupBlobUploads({
    store: {
      claimCleanupCandidates: async () => [
        {
          id: "missing",
          url: "https://owned.private.blob.vercel-storage.com/missing.png",
          sourceUrl: null,
          pathname: "places/user-1/missing.png",
          contentType: "image/png" as const,
          lifecycle: "PENDING_DELETE",
          createdAt: new Date("2026-08-09T00:00:00.000Z"),
          leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
        },
      ],
      deleteClaimedRecord: async () => true,
      releaseDeleteClaim: async () => {},
    },
    del: async () => {
      throw Object.assign(new Error("not found"), { statusCode: 404 });
    },
  });

  assert.deepEqual(result, { deleted: 1, failed: 0 });
});

test("race verifier covers leased conversion deletion through cleanup", () => {
  const races = source("scripts/verify-races.ts");
  assert.match(races, /PASS Blob conversion\/delete race/);
});

test("Blob conversion and provider cleanup use bounded abort signals", () => {
  const blobs = source("src/lib/blob-uploads.ts");
  const uploads = source("src/app/api/uploads/route.ts");
  assert.match(blobs, /AbortSignal\.timeout|abortSignal/);
  assert.match(uploads, /AbortSignal\.timeout|abortSignal/);
  assert.match(blobs, /5 \* 1024 \* 1024/);
  assert.match(blobs, /image\/jpeg/);
  assert.match(blobs, /image\/png/);
  assert.match(blobs, /image\/webp/);
});

test("hung Blob provider call times out before conversion lease expiry", async () => {
  const blobs = await import("./blob-uploads");
  let aborted = false;
  let released = 0;
  const started = Date.now();
  const result = await blobs.convertLegacyBlobUploads({
    now: new Date("2026-08-09T12:00:00.000Z"),
    timeoutMs: 20,
    allowedHosts: ["owned.public.blob.vercel-storage.com"],
    store: {
      claimConversionCandidates: async () => [
        {
          id: "hung-provider",
          ownerId: "user-1",
          url: null,
          sourceUrl:
            "https://owned.public.blob.vercel-storage.com/hung.png",
          pathname: "places/user-1/legacy/hung",
          contentType: null,
          lifecycle: "CONVERTING",
          leaseUntil: new Date("2026-08-09T12:05:00.000Z"),
        },
      ],
      recordPrivateCopy: async () => true,
      finishConversion: async () => true,
      releaseConversionClaim: async () => {
        released += 1;
      },
    },
    get: async (
      _url: string,
      options: { abortSignal: AbortSignal },
    ) => {
      options.abortSignal.addEventListener("abort", () => {
        aborted = true;
      });
      return await new Promise<never>(() => {});
    },
    put: async () => {
      throw new Error("put must not run");
    },
    del: async () => {},
    token: "blob-token",
  } as never);

  assert.ok(Date.now() - started < 1000);
  assert.equal(aborted, true);
  assert.equal(released, 1);
  assert.deepEqual(result, { converted: 0, failed: 1 });
});

test("blob conversion readiness gates startup and rejects pending or failed rows", () => {
  const readinessPath = new URL("../../scripts/verify-blob-conversion.ts", import.meta.url);
  assert.equal(existsSync(readinessPath), true);
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.match(packageJson.scripts?.["verify:blob-conversion"] ?? "", /verify-blob-conversion/);
  const readiness = source("scripts/verify-blob-conversion.ts");
  assert.match(readiness, /PENDING_PRIVATE_COPY/);
  assert.match(readiness, /CONVERTING/);
  assert.match(readiness, /PENDING_PUBLIC_DELETE/);
  assert.match(readiness, /lastError/);
  assert.match(source("scripts/acceptance-server.ts"), /verify-blob-conversion/);
});

test("production auth fails without valid trusted proxies and accepts exact proxy IPs", async () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--eval", "import('./src/lib/auth.ts')"],
    {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/placedecide",
        BETTER_AUTH_SECRET: "x".repeat(32),
        BETTER_AUTH_URL: "http://localhost:3000",
        TRUSTED_PROXY_IPS: "",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /TRUSTED_PROXY_IPS/i,
  );

  const rateLimits = source("src/lib/rate-limit.ts");
  assert.match(rateLimits, /isIP/);
  assert.match(source("src/lib/auth.ts"), /disableIpTracking/);
  const { trustedProxyList } = await import("./rate-limit");
  assert.deepEqual(
    trustedProxyList({
      NODE_ENV: "production",
      TRUSTED_PROXY_IPS: "127.0.0.1,::1,10.0.0.0/8",
    }),
    ["127.0.0.1", "::1", "10.0.0.0/8"],
  );
});

test("acceptance captures immutable source identity before build and checks tracked cleanliness", () => {
  const server = source("scripts/acceptance-server.ts");
  const sourceCommit = server.indexOf("const sourceCommit = currentCommit()");
  const build = server.indexOf('runNode(nextBin, ["build"]');
  assert.ok(sourceCommit >= 0 && sourceCommit < build);
  assert.match(server, /status",\s*"--porcelain",\s*"--untracked-files=no"/);
  assert.match(server, /currentCommit\(\),\s*sourceCommit/);
});

test("browser acceptance cleanup surrounds database and browser setup", async () => {
  const browser = source("scripts/acceptance-browser.ts");
  const browserResources = source("scripts/acceptance-browser-resources.ts");
  const tryIndex = browser.indexOf("\n  try {");
  assert.ok(tryIndex >= 0);
  assert.ok(tryIndex < browser.indexOf("seedDemoUsers()"));
  assert.match(browser, /closeBrowserResources/);
  assert.match(browserResources, /browser\?\.close/);
  assert.match(browserResources, /contexts\.map/);

  const cleanupModule = await import(
    "../../scripts/acceptance-browser-resources"
  ).catch(() => null);
  assert.ok(cleanupModule, "browser resource cleanup helper must be importable");
  const events: string[] = [];
  await cleanupModule.closeBrowserResources({
    contexts: [
      { close: async () => void events.push("context-1") },
      { close: async () => void events.push("context-2") },
    ],
    browser: { close: async () => void events.push("browser") },
    prisma: {
      user: {
        deleteMany: async () => {
          events.push("fresh-user");
          return { count: 1 };
        },
      },
      $disconnect: async () => void events.push("prisma"),
    },
    freshEmail: "setup-failed@example.com",
  } as never);
  assert.deepEqual(events.slice(0, 2), ["context-1", "context-2"]);
  assert.ok(events.indexOf("browser") > 1);
  assert.ok(events.indexOf("fresh-user") > 1);
  assert.ok(events.indexOf("prisma") > events.indexOf("fresh-user"));
});

test("browser acceptance cleanup survives synchronous resource failures", async () => {
  const { closeBrowserResources } = await import(
    "../../scripts/acceptance-browser-resources"
  );
  const events: string[] = [];

  await assert.rejects(
    closeBrowserResources({
      contexts: [
        {
          close: () => {
            events.push("context-failed");
            throw new Error("context close failed");
          },
        },
        { close: async () => void events.push("context-closed") },
      ],
      browser: {
        close: () => {
          events.push("browser-failed");
          throw new Error("browser close failed");
        },
      },
      prisma: {
        user: {
          deleteMany: async () => {
            events.push("fresh-user");
            return { count: 1 };
          },
        },
        $disconnect: async () => void events.push("prisma"),
      },
      freshEmail: "setup-failed@example.com",
    } as never),
    AggregateError,
  );
  assert.deepEqual(events.slice(0, 2), [
    "context-failed",
    "context-closed",
  ]);
  assert.ok(events.indexOf("browser-failed") > 1);
  assert.ok(events.indexOf("fresh-user") > 1);
  assert.ok(events.indexOf("prisma") > events.indexOf("fresh-user"));
});

test("profile avatar updates reject external URLs and UI keeps initials fallback", async () => {
  const persistence = {
    findUserByUsername: async () => null,
    findVisibleProfile: async () => null,
    updateUser: async () => ({
      id: "user-1",
      username: "user",
      name: "User",
      image: null,
      bio: null,
    }),
  };
  const profiles = await import("./profiles");
  await assert.rejects(
    profiles.updateProfile(
      "user-1",
      { avatar: "https://images.example/avatar.png" },
      persistence,
    ),
    (error: unknown) =>
      error instanceof profiles.ProfileError &&
      error.code === "INVALID_INPUT",
  );
  assert.doesNotMatch(
    source("src/app/(app)/settings/profile/ProfileForm.tsx"),
    /Avatar URL/,
  );
});

test("place parser rejects invalid Maps URLs at the trust boundary", async () => {
  const places = await import("./places");
  for (const url of [
    "http://www.google.com/maps/place/Cafe",
    "https://user:pass@www.google.com/maps/place/Cafe",
    "https://example.com/not-maps",
  ]) {
    assert.throws(
      () => places.parsePlaceInput({ type: "mapsUrl", url }),
      /Invalid|Google Maps|supported/i,
    );
  }
  assert.throws(
    () =>
      places.parsePlaceInput({
        type: "manual",
        name: "Cafe",
        address: "1 Main",
        area: "a".repeat(121),
      }),
    /Invalid place input/,
  );
});

test("private Blob hardening migration preserves prior conversion references", () => {
  const hardening = source(
    "prisma/migrations/20260809012000_private_blob_hardening/migration.sql",
  );
  const verifier = source("scripts/verify-migrations.ts");
  const readiness = source("scripts/verify-blob-conversion.ts");

  assert.match(hardening, /blob\."url"/);
  assert.match(hardening, /blob\."sourceUrl"/);
  assert.match(hardening, /PENDING_PRIVATE_COPY/);
  assert.match(hardening, /CONVERTING/);
  assert.match(hardening, /PENDING_PUBLIC_DELETE/);
  assert.doesNotMatch(
    hardening,
    /SET[\s\S]*"sourceUrl"\s*=\s*blob\."url"[\s\S]*"url"\s*=\s*NULL/,
  );
  assert.match(hardening, /UPDATE "User"[\s\S]*"image"\s*=\s*NULL/);
  assert.match(verifier, /PASS prior private Blob states preserve public references/);
  assert.match(verifier, /PASS Blob readiness rejects surviving public references/);
  assert.match(readiness, /sourceUrl/);
  assert.match(readiness, /public\\+\.blob\\+\.vercel-storage\\+\.com/);
});

test("auth signup sanitizes name and image before database creation", () => {
  const auth = source("src/lib/auth.ts");
  const acceptance = source("scripts/acceptance-social.ts");
  const migration = source(
    "prisma/migrations/20260809012000_private_blob_hardening/migration.sql",
  );

  assert.match(auth, /const name\s*=\s*user\.name\.trim\(\)/);
  assert.match(auth, /name\.length\s*>\s*80/);
  assert.match(auth, /image:\s*null/);
  assert.match(acceptance, /\/api\/auth\/sign-up\/email/);
  assert.match(acceptance, /image:\s*"https:\/\/images\.example/);
  assert.match(acceptance, /image:\s*null/);
  assert.match(migration, /UPDATE "User"[\s\S]*"image"\s*=\s*NULL/);

  for (const path of [
    "src/lib/profiles.ts",
    "src/lib/friendships.ts",
    "src/lib/interactions.ts",
    "src/lib/posts.ts",
    "src/app/api/users/search/route.ts",
    "src/app/api/posts/[id]/comments/route.ts",
  ]) {
    assert.doesNotMatch(source(path), /image:\s*true/, path);
  }
});

test("legacy conversion uses bounded sequential batches", async () => {
  const blobs = await import("./blob-uploads");
  let claimedTake = 0;
  let active = 0;
  let maximumActive = 0;
  const leaseUntil = new Date("2026-08-09T12:05:00.000Z");
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    id: `candidate-${index}`,
    ownerId: "user-1",
    url: null,
    sourceUrl:
      `https://owned.public.blob.vercel-storage.com/old-${index}.png`,
    pathname: `places/user-1/legacy/old-${index}.png`,
    lifecycle: "CONVERTING" as const,
    leaseUntil,
    contentType: null,
  }));

  const result = await blobs.convertLegacyBlobUploads({
    now: new Date("2026-08-09T12:00:00.000Z"),
    allowedHosts: ["owned.public.blob.vercel-storage.com"],
    store: {
      claimConversionCandidates: async (_now, _lease, take) => {
        claimedTake = take;
        return candidates.slice(0, take);
      },
      recordPrivateCopy: async () => true,
      finishConversion: async () => true,
      releaseConversionClaim: async () => {},
    },
    get: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new Uint8Array([
                0x89,
                0x50,
                0x4e,
                0x47,
                0x0d,
                0x0a,
                0x1a,
                0x0a,
              ]),
            );
            controller.close();
          },
        }),
        blob: { contentType: "image/png", size: 8 },
      };
    },
    put: async (pathname) => ({
      url: `https://owned.private.blob.vercel-storage.com/${pathname}`,
      pathname,
    }),
    del: async () => {},
    token: "blob-token",
  });

  assert.ok(claimedTake <= 4);
  assert.equal(maximumActive, 1);
  assert.deepEqual(result, { converted: claimedTake, failed: 0 });
});

test("acceptance rejects non-review untracked files and completes cleanup after stop failure", async () => {
  const acceptance = await import("../../scripts/acceptance-server") as typeof import("../../scripts/acceptance-server") & {
    assertAcceptanceSourceState?: (
      trackedStatus: string,
      untrackedPaths: readonly string[],
    ) => void;
    cleanupFreshServerResources?: (input: {
      stopServer: () => Promise<void>;
      removeBuild: () => Promise<void>;
      restoreEnvironment: () => void;
      assertCommit: () => void;
      assertSourceClean: () => void;
    }) => Promise<void>;
  };

  assert.equal(typeof acceptance.assertAcceptanceSourceState, "function");
  acceptance.assertAcceptanceSourceState?.("", [
    ".superpowers/sdd/final-review-package.md",
  ]);
  assert.throws(
    () => acceptance.assertAcceptanceSourceState?.("", ["src/runtime.ts"]),
    /untracked/i,
  );
  assert.throws(
    () => acceptance.assertAcceptanceSourceState?.("", [".env.local"]),
    /untracked/i,
  );

  assert.equal(typeof acceptance.cleanupFreshServerResources, "function");
  const events: string[] = [];
  await assert.rejects(
    acceptance.cleanupFreshServerResources?.({
      stopServer: () => {
        events.push("stop");
        throw new Error("stop failed");
      },
      removeBuild: async () => {
        events.push("remove");
      },
      restoreEnvironment: () => {
        events.push("restore");
      },
      assertCommit: () => {
        events.push("commit");
      },
      assertSourceClean: () => {
        events.push("clean");
      },
    }),
    AggregateError,
  );
  assert.deepEqual(events, ["stop", "remove", "restore", "commit", "clean"]);
});

test("deployment docs state proxy topology and multipart body-limit requirements", () => {
  const readme = source("README.md");
  const packageJson = source("package.json");
  assert.match(packageJson, /check:deployment/);
  assert.equal(
    existsSync(new URL("../../scripts/check-deployment.ts", import.meta.url)),
    true,
  );
  assert.match(readme, /origin isolation/i);
  assert.match(readme, /authenticated client IP header|trusted proxy chain/i);
  assert.match(readme, /direct[- ]peer|direct origin/i);
  assert.match(readme, /request body limit/i);
  assert.match(readme, /missing or chunked `?Content-Length`?/i);
});

test("unreleased migration repair is explicit and refuses ambiguous databases", () => {
  const packageJson = source("package.json");
  assert.match(packageJson, /repair:unreleased-migrations/);
  assert.equal(
    existsSync(new URL("../../scripts/repair-unreleased-migrations.ts", import.meta.url)),
    true,
  );
  const repair = source("scripts/repair-unreleased-migrations.ts");
  assert.match(repair, /ALLOW_UNRELEASED_MIGRATION_REPAIR/);
  assert.match(repair, /NODE_ENV[\s\S]*production/);
  assert.match(repair, /SavedPlaceImage/);
  assert.match(repair, /checksum/);
  assert.match(repair, /pre-release|unreleased/i);
});

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
  assert.match(enumSql, /Unsupported SavedPlaceImage URL/);
  assert.match(enumSql, /ADD VALUE IF NOT EXISTS 'RESERVED'/);
  assert.doesNotMatch(enumSql, /'RESERVED'::"BlobLifecycle"/);
  const unsupportedAbort = sql.indexOf(
    "Unsupported SavedPlaceImage URL",
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
  assert.match(sql, /\\\.public\\\.blob\\\.vercel-storage\\\.com/);
  assert.match(sql, /PENDING_PRIVATE_COPY/);
  assert.match(sql, /\\\.private\\\.blob\\\.vercel-storage\\\.com/);
  assert.match(sql, /CLAIMED/);
  assert.match(sql, /'\/api\/media\/' \|\| image\."blobUploadId"/);
  assert.match(sql, /ALTER COLUMN "blobUploadId" SET NOT NULL/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test("migration verifier executes private, public, and unsupported image proofs", () => {
  const verifier = source("scripts/verify-migrations.ts");

  assert.match(verifier, /PASS private Blob image backfills exact owner and claimed lifecycle/);
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
      assert.deepEqual(options, {
        access: "public",
        token: "blob-token",
        useCache: false,
      });
      return {
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
        blob: { contentType: "image/webp" },
      };
    },
    put: async (
      pathname: string,
      _stream: ReadableStream<Uint8Array>,
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
  assert.match(
    browser,
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

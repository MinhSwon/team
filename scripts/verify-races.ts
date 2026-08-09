import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { Pool } from "pg";

loadEnvFile();

const RACE_APPLICATION = "placedecide_serializable_race";

// Production interaction and friendship helpers both use PostgreSQL Serializable transactions.
function exactNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "NOT_FOUND" &&
    "status" in error &&
    error.status === 404 &&
    error.message === "Post not found"
  );
}

async function waitForWrite(
  pool: Pool,
  table: "PostLike" | "Comment",
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ active: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_stat_activity
          WHERE application_name = $1
            AND state = 'active'
            AND query ILIKE $2
       ) AS active`,
      [RACE_APPLICATION, `%${table}%`],
    );
    if (result.rows[0]?.active) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${table} write`);
}

async function waitForBlockedBlobUpdate(pool: Pool) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM pg_stat_activity
          WHERE application_name = $1
            AND state = 'active'
            AND wait_event_type = 'Lock'
            AND query ILIKE '%BlobUpload%'
       ) AS blocked`,
      [RACE_APPLICATION],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Timed out waiting for blocked BlobUpload update");
}

async function waitForBlockedTransactions(pool: Pool, count: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked: number }>(
      `SELECT count(*)::int AS blocked
         FROM pg_stat_activity
        WHERE application_name = $1
          AND state = 'active'
          AND wait_event_type = 'Lock'`,
      [RACE_APPLICATION],
    );
    if ((result.rows[0]?.blocked ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${count} blocked transactions`);
}

async function installDelayTrigger(
  prisma: {
    $executeRawUnsafe(query: string): Promise<number>;
  },
  table: "PostLike" | "Comment",
) {
  const suffix = table.toLowerCase();
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "race_delay_${suffix}"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_sleep(2);
      RETURN NEW;
    END
    $$;
    CREATE TRIGGER "race_delay_${suffix}_trigger"
    BEFORE INSERT ON "${table}"
    FOR EACH ROW EXECUTE FUNCTION "race_delay_${suffix}"();
  `);
}

async function removeDelayTrigger(
  prisma: {
    $executeRawUnsafe(query: string): Promise<number>;
  },
  table: "PostLike" | "Comment",
) {
  const suffix = table.toLowerCase();
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS "race_delay_${suffix}_trigger" ON "${table}";
    DROP FUNCTION IF EXISTS "race_delay_${suffix}"();
  `);
}

async function childMain() {
  const adminUrl = process.env.RACE_ADMIN_URL;
  assert.ok(adminUrl, "RACE_ADMIN_URL is required");
  const monitor = new Pool({ connectionString: adminUrl });
  const { prisma } = await import("../src/lib/db");
  const { friendPairKey, removeFriendship } = await import(
    "../src/lib/friendships"
  );
  const { createPostComment, togglePostLike } = await import(
    "../src/lib/interactions"
  );
  const { cleanupBlobUploads, convertLegacyBlobUploads } = await import(
    "../src/lib/blob-uploads"
  );
  const { deleteSavedPlace, updateSavedPlace } = await import(
    "../src/lib/posts"
  );

  const ownerId = `race-owner-${randomUUID()}`;
  const viewerId = `race-viewer-${randomUUID()}`;
  const placeId = `race-place-${randomUUID()}`;
  const savedPlaceId = `race-saved-${randomUUID()}`;
  const postId = `race-post-${randomUUID()}`;

  await prisma.user.createMany({
    data: [
      {
        id: ownerId,
        name: "Race Owner",
        email: `${ownerId}@example.invalid`,
        username: ownerId,
      },
      {
        id: viewerId,
        name: "Race Viewer",
        email: `${viewerId}@example.invalid`,
        username: viewerId,
      },
    ],
  });
  await prisma.place.create({
    data: {
      id: placeId,
      name: "Race Place",
      normalizedName: "race place",
      address: "1 Race Way",
      normalizedAddress: "1 race way",
    },
  });
  await prisma.userSavedPlace.create({
    data: {
      id: savedPlaceId,
      userId: ownerId,
      placeId,
      tags: [],
    },
  });
  await prisma.post.create({
    data: {
      id: postId,
      authorId: ownerId,
      savedPlaceId,
    },
  });

  async function acceptedFriendship() {
    return prisma.friendship.create({
      data: {
        requesterId: ownerId,
        addresseeId: viewerId,
        pairKey: friendPairKey(ownerId, viewerId),
        status: "ACCEPTED",
      },
    });
  }

  async function verifyScenario(
    table: "PostLike" | "Comment",
    interact: () => Promise<unknown>,
    writeCount: () => Promise<number>,
    notificationType: "POST_LIKED" | "POST_COMMENTED",
  ) {
    const friendship = await acceptedFriendship();
    await installDelayTrigger(prisma, table);
    const beforeWrites = await writeCount();
    const beforeNotifications = await prisma.notification.count({
      where: { postId, actorId: viewerId, type: notificationType },
    });

    const interaction = interact();
    await waitForWrite(monitor, table);
    const removal = await removeFriendship(viewerId, friendship.id);
    const result = await interaction.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    await removeDelayTrigger(prisma, table);

    assert.equal(removal.id, friendship.id);
    assert.equal(
      await prisma.friendship.count({ where: { id: friendship.id } }),
      0,
    );
    const afterRaceWrites = await writeCount();
    const afterRaceNotifications = await prisma.notification.count({
      where: { postId, actorId: viewerId, type: notificationType },
    });

    if (result.status === "fulfilled") {
      assert.equal(afterRaceWrites, beforeWrites + 1);
      assert.equal(afterRaceNotifications, beforeNotifications + 1);
    } else {
      assert.ok(
        exactNotFound(result.reason),
        `race rejection must be opaque 404 after P2034 retry: ${String(result.reason)}`,
      );
      assert.equal(afterRaceWrites, beforeWrites);
      assert.equal(afterRaceNotifications, beforeNotifications);
    }

    await assert.rejects(interact(), exactNotFound);
    assert.equal(await writeCount(), afterRaceWrites);
    assert.equal(
      await prisma.notification.count({
        where: { postId, actorId: viewerId, type: notificationType },
      }),
      afterRaceNotifications,
    );
    console.log(
      `PASS ${table} race: ${result.status === "fulfilled" ? "serialized before removal" : "P2034 retry returned Post not found"}`,
    );
  }

  async function verifyBlobConversionDeleteRace() {
    const blobPlaceId = `race-blob-place-${randomUUID()}`;
    const blobSavedPlaceId = `race-blob-saved-${randomUUID()}`;
    const blobId = `race-blob-${randomUUID()}`;
    const imageId = `race-image-${randomUUID()}`;
    const sourceUrl =
      "https://owned.public.blob.vercel-storage.com/race-source.png";
    const pathname = `places/${ownerId}/legacy/race-source.png`;
    const privateUrl =
      `https://owned.private.blob.vercel-storage.com/${pathname}`;
    const conversionNow = new Date();
    const conversionLease = new Date(
      conversionNow.getTime() + 5 * 60 * 1000,
    );

    await prisma.place.create({
      data: {
        id: blobPlaceId,
        name: "Blob Race Place",
        normalizedName: "blob race place",
        address: "2 Race Way",
        normalizedAddress: "2 race way",
      },
    });
    await prisma.userSavedPlace.create({
      data: {
        id: blobSavedPlaceId,
        userId: ownerId,
        placeId: blobPlaceId,
        tags: [],
      },
    });
    await prisma.blobUpload.create({
      data: {
        id: blobId,
        ownerId,
        sourceUrl,
        pathname,
        lifecycle: "PENDING_PRIVATE_COPY",
      },
    });
    await prisma.savedPlaceImage.create({
      data: {
        id: imageId,
        savedPlaceId: blobSavedPlaceId,
        blobUploadId: blobId,
        url: `/api/media/${blobId}`,
        sortOrder: 0,
      },
    });

    let signalPutStarted = () => {};
    const putStarted = new Promise<void>((resolve) => {
      signalPutStarted = resolve;
    });
    let releasePut = () => {};
    const putBlocked = new Promise<void>((resolve) => {
      releasePut = resolve;
    });

    const conversion = convertLegacyBlobUploads({
      now: conversionNow,
      allowedHosts: ["owned.public.blob.vercel-storage.com"],
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
        blob: { contentType: "image/png", size: 8 },
      }),
      put: async () => {
        signalPutStarted();
        await putBlocked;
        return { url: privateUrl, pathname };
      },
      del: async () => {
        throw new Error("defer public deletion to cleanup");
      },
      token: "mock-token",
    });

    await putStarted;
    assert.deepEqual(
      await prisma.blobUpload.findUnique({
        where: { id: blobId },
        select: { lifecycle: true, leaseUntil: true },
      }),
      { lifecycle: "CONVERTING", leaseUntil: conversionLease },
    );

    await deleteSavedPlace(ownerId, blobSavedPlaceId);
    assert.deepEqual(
      await prisma.blobUpload.findUnique({
        where: { id: blobId },
        select: { lifecycle: true, leaseUntil: true },
      }),
      { lifecycle: "PENDING_DELETE", leaseUntil: conversionLease },
    );

    const earlyDeletes: string[] = [];
    assert.deepEqual(
      await cleanupBlobUploads({
        now: new Date(conversionLease.getTime() - 1),
        del: async (reference) => void earlyDeletes.push(reference),
      }),
      { deleted: 0, failed: 0 },
    );
    assert.deepEqual(earlyDeletes, []);

    releasePut();
    assert.deepEqual(await conversion, { converted: 0, failed: 1 });
    assert.deepEqual(
      await prisma.blobUpload.findUnique({
        where: { id: blobId },
        select: {
          lifecycle: true,
          leaseUntil: true,
          url: true,
          sourceUrl: true,
          pathname: true,
        },
      }),
      {
        lifecycle: "PENDING_DELETE",
        leaseUntil: conversionLease,
        url: privateUrl,
        sourceUrl,
        pathname,
      },
    );

    const cleanupDeletes: string[] = [];
    assert.deepEqual(
      await cleanupBlobUploads({
        now: new Date(conversionLease.getTime() + 1),
        del: async (reference) => void cleanupDeletes.push(reference),
      }),
      { deleted: 1, failed: 0 },
    );
    assert.deepEqual(new Set(cleanupDeletes), new Set([privateUrl, sourceUrl]));
    assert.equal(
      await prisma.blobUpload.count({ where: { id: blobId } }),
      0,
    );
    console.log(
      "PASS Blob conversion/delete race: leased delete intent retained both references for cleanup",
    );
  }

  async function verifyBlobClaimDeleteBoundary() {
    const claimPlaceId = `race-claim-place-${randomUUID()}`;
    const claimSavedPlaceId = `race-claim-saved-${randomUUID()}`;
    const blockerBlobId = `race-claim-000-blocker-${randomUUID()}`;
    const targetBlobId = `race-claim-zzz-target-${randomUUID()}`;
    const sourceUrl =
      "https://owned.public.blob.vercel-storage.com/race-claim.png";
    const pathname = `places/${ownerId}/legacy/race-claim.png`;
    const privateUrl =
      `https://owned.private.blob.vercel-storage.com/${pathname}`;
    const conversionNow = new Date();
    const conversionLease = new Date(
      conversionNow.getTime() + 5 * 60 * 1000,
    );

    await prisma.place.create({
      data: {
        id: claimPlaceId,
        name: "Blob Claim Race Place",
        normalizedName: "blob claim race place",
        address: "3 Race Way",
        normalizedAddress: "3 race way",
      },
    });
    await prisma.userSavedPlace.create({
      data: {
        id: claimSavedPlaceId,
        userId: ownerId,
        placeId: claimPlaceId,
        tags: [],
      },
    });
    await prisma.blobUpload.create({
      data: {
        id: blockerBlobId,
        ownerId,
        url: "https://owned.private.blob.vercel-storage.com/blocker.png",
        pathname: `places/${ownerId}/blocker.png`,
        lifecycle: "CLAIMED",
      },
    });
    await prisma.blobUpload.create({
      data: {
        id: targetBlobId,
        ownerId,
        sourceUrl,
        pathname,
        lifecycle: "PENDING_PRIVATE_COPY",
      },
    });
    await prisma.savedPlaceImage.createMany({
      data: [
        {
          id: `race-claim-image-000-${randomUUID()}`,
          savedPlaceId: claimSavedPlaceId,
          blobUploadId: blockerBlobId,
          url: `/api/media/${blockerBlobId}`,
          sortOrder: 0,
        },
        {
          id: `race-claim-image-zzz-${randomUUID()}`,
          savedPlaceId: claimSavedPlaceId,
          blobUploadId: targetBlobId,
          url: `/api/media/${targetBlobId}`,
          sortOrder: 1,
        },
      ],
    });

    const blocker = await monitor.connect();
    await blocker.query("BEGIN");
    await blocker.query(
      `SELECT 1 FROM "BlobUpload" WHERE "id" = $1 FOR UPDATE`,
      [blockerBlobId],
    );
    let blockerOpen = true;
    let signalPutStarted = () => {};
    const putStarted = new Promise<void>((resolve) => {
      signalPutStarted = resolve;
    });
    let releasePut = () => {};
    const putBlocked = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    let conversion: Promise<{ converted: number; failed: number }> | undefined;
    const deletion = deleteSavedPlace(ownerId, claimSavedPlaceId);

    try {
      await waitForBlockedBlobUpdate(monitor);
      assert.equal(
        (
          await prisma.blobUpload.findUniqueOrThrow({
            where: { id: targetBlobId },
            select: { lifecycle: true },
          })
        ).lifecycle,
        "PENDING_PRIVATE_COPY",
        "delete must block before touching claim target",
      );

      conversion = convertLegacyBlobUploads({
        now: conversionNow,
        allowedHosts: ["owned.public.blob.vercel-storage.com"],
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
          blob: { contentType: "image/png", size: 8 },
        }),
        put: async () => {
          signalPutStarted();
          await putBlocked;
          return { url: privateUrl, pathname };
        },
        del: async () => {},
        token: "mock-token",
      });

      await putStarted;
      assert.deepEqual(
        await prisma.blobUpload.findUnique({
          where: { id: targetBlobId },
          select: { lifecycle: true, leaseUntil: true },
        }),
        { lifecycle: "CONVERTING", leaseUntil: conversionLease },
      );

      await blocker.query("COMMIT");
      blockerOpen = false;
      await deletion;
      releasePut();

      assert.deepEqual(await conversion, { converted: 0, failed: 1 });
      assert.deepEqual(
        await prisma.blobUpload.findUnique({
          where: { id: targetBlobId },
          select: {
            lifecycle: true,
            leaseUntil: true,
            url: true,
            sourceUrl: true,
            pathname: true,
          },
        }),
        {
          lifecycle: "PENDING_DELETE",
          leaseUntil: conversionLease,
          url: privateUrl,
          sourceUrl,
          pathname,
        },
      );
      assert.equal(
        await prisma.savedPlaceImage.count({
          where: { blobUploadId: targetBlobId },
        }),
        0,
      );

      const cleanupDeletes: string[] = [];
      assert.deepEqual(
        await cleanupBlobUploads({
          now: new Date(conversionLease.getTime() + 1),
          del: async (reference) => void cleanupDeletes.push(reference),
        }),
        { deleted: 2, failed: 0 },
      );
      assert.deepEqual(
        new Set(cleanupDeletes),
        new Set([
          privateUrl,
          sourceUrl,
          "https://owned.private.blob.vercel-storage.com/blocker.png",
        ]),
      );
      assert.equal(
        await prisma.blobUpload.count({
          where: { id: { in: [blockerBlobId, targetBlobId] } },
        }),
        0,
      );
      console.log(
        "PASS Blob claim/delete boundary: atomic delete intent prevents unreferenced CLAIMED conversion",
      );
    } finally {
      releasePut();
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
      await Promise.allSettled([deletion, ...(conversion ? [conversion] : [])]);
    }
  }

  async function verifyBlobUpdateDeleteParentLock() {
    const updatePlaceId = `race-update-place-${randomUUID()}`;
    const updateSavedPlaceId = `race-update-saved-${randomUUID()}`;
    const oldBlobId = `race-update-000-old-${randomUUID()}`;
    const leasedBlobId = `race-update-mmm-leased-${randomUUID()}`;
    const replacementBlobId = `race-update-zzz-replacement-${randomUUID()}`;
    const oldUrl =
      "https://owned.private.blob.vercel-storage.com/update-old.png";
    const leasedUrl =
      "https://owned.private.blob.vercel-storage.com/update-leased.png";
    const replacementUrl =
      "https://owned.private.blob.vercel-storage.com/update-replacement.png";
    const retainedLease = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.place.create({
      data: {
        id: updatePlaceId,
        name: "Blob Update Delete Race Place",
        normalizedName: "blob update delete race place",
        address: "4 Race Way",
        normalizedAddress: "4 race way",
      },
    });
    await prisma.userSavedPlace.create({
      data: {
        id: updateSavedPlaceId,
        userId: ownerId,
        placeId: updatePlaceId,
        tags: [],
      },
    });
    await prisma.blobUpload.create({
      data: {
        id: oldBlobId,
        ownerId,
        url: oldUrl,
        pathname: `places/${ownerId}/update-old.png`,
        lifecycle: "CLAIMED",
      },
    });
    await prisma.blobUpload.create({
      data: {
        id: leasedBlobId,
        ownerId,
        url: leasedUrl,
        pathname: `places/${ownerId}/update-leased.png`,
        lifecycle: "PENDING_DELETE",
        leaseUntil: retainedLease,
      },
    });
    await prisma.blobUpload.create({
      data: {
        id: replacementBlobId,
        ownerId,
        url: replacementUrl,
        pathname: `places/${ownerId}/update-replacement.png`,
        lifecycle: "UPLOADED",
      },
    });
    await prisma.savedPlaceImage.createMany({
      data: [
        {
          id: `race-update-image-old-${randomUUID()}`,
          savedPlaceId: updateSavedPlaceId,
          blobUploadId: oldBlobId,
          url: `/api/media/${oldBlobId}`,
          sortOrder: 0,
        },
        {
          id: `race-update-image-leased-${randomUUID()}`,
          savedPlaceId: updateSavedPlaceId,
          blobUploadId: leasedBlobId,
          url: `/api/media/${leasedBlobId}`,
          sortOrder: 1,
        },
      ],
    });

    const blocker = await monitor.connect();
    await blocker.query("BEGIN");
    await blocker.query(
      `SELECT 1 FROM "BlobUpload" WHERE "id" = $1 FOR UPDATE`,
      [oldBlobId],
    );
    let blockerOpen = true;
    const update = updateSavedPlace(ownerId, updateSavedPlaceId, {
      review: "Replacement committed before delete",
      images: [{ uploadId: replacementBlobId, caption: null }],
    });
    let deletion: Promise<void> | undefined;

    try {
      await waitForBlockedBlobUpdate(monitor);
      deletion = deleteSavedPlace(ownerId, updateSavedPlaceId);
      await waitForBlockedTransactions(monitor, 2);

      await blocker.query("COMMIT");
      blockerOpen = false;
      const [updateResult, deleteResult] = await Promise.allSettled([
        update,
        deletion,
      ]);
      assert.equal(updateResult.status, "fulfilled");
      assert.equal(deleteResult.status, "fulfilled");

      assert.equal(
        await prisma.userSavedPlace.count({
          where: { id: updateSavedPlaceId },
        }),
        0,
      );
      assert.equal(
        await prisma.savedPlaceImage.count({
          where: { savedPlaceId: updateSavedPlaceId },
        }),
        0,
      );
      assert.deepEqual(
        await prisma.blobUpload.findMany({
          where: {
            id: { in: [oldBlobId, leasedBlobId, replacementBlobId] },
          },
          select: { id: true, lifecycle: true, leaseUntil: true },
          orderBy: { id: "asc" },
        }),
        [
          { id: oldBlobId, lifecycle: "PENDING_DELETE", leaseUntil: null },
          {
            id: leasedBlobId,
            lifecycle: "PENDING_DELETE",
            leaseUntil: retainedLease,
          },
          {
            id: replacementBlobId,
            lifecycle: "PENDING_DELETE",
            leaseUntil: null,
          },
        ],
      );

      const earlyDeletes: string[] = [];
      assert.deepEqual(
        await cleanupBlobUploads({
          now: new Date(retainedLease.getTime() - 1),
          del: async (reference) => void earlyDeletes.push(reference),
        }),
        { deleted: 2, failed: 0 },
      );
      assert.deepEqual(
        new Set(earlyDeletes),
        new Set([oldUrl, replacementUrl]),
      );
      assert.equal(
        await prisma.blobUpload.count({ where: { id: leasedBlobId } }),
        1,
      );

      const lateDeletes: string[] = [];
      assert.deepEqual(
        await cleanupBlobUploads({
          now: new Date(retainedLease.getTime() + 1),
          del: async (reference) => void lateDeletes.push(reference),
        }),
        { deleted: 1, failed: 0 },
      );
      assert.deepEqual(lateDeletes, [leasedUrl]);
      assert.equal(
        await prisma.blobUpload.count({
          where: { id: { in: [oldBlobId, leasedBlobId, replacementBlobId] } },
        }),
        0,
      );
      console.log(
        "PASS Blob update/delete race: parent-first locking covers replacement and retains leased delete intent",
      );
    } finally {
      if (blockerOpen) await blocker.query("ROLLBACK");
      blocker.release();
      await Promise.allSettled([update, ...(deletion ? [deletion] : [])]);
    }
  }

  try {
    await verifyScenario(
      "PostLike",
      () => togglePostLike(viewerId, postId, true),
      () => prisma.postLike.count({ where: { postId, userId: viewerId } }),
      "POST_LIKED",
    );
    await verifyScenario(
      "Comment",
      () => createPostComment(viewerId, postId, "Live race comment"),
      () =>
        prisma.comment.count({
          where: { postId, authorId: viewerId, deletedAt: null },
        }),
      "POST_COMMENTED",
    );
    await verifyBlobConversionDeleteRace();
    await verifyBlobClaimDeleteBoundary();
    await verifyBlobUpdateDeleteParentLock();
  } finally {
    await monitor.end();
    await prisma.$disconnect();
  }
}

function temporaryDatabaseUrl(databaseUrl: string, database: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete("options");
  url.searchParams.delete("application_name");
  url.searchParams.set("schema", "public");
  return url.toString();
}

function runtimeUrl(databaseUrl: string, database: string) {
  const url = new URL(temporaryDatabaseUrl(databaseUrl, database));
  url.searchParams.delete("schema");
  url.searchParams.set("application_name", RACE_APPLICATION);
  return url.toString();
}

async function parentMain() {
  const configuredUrl = process.env.DATABASE_URL?.trim();
  assert.ok(configuredUrl, "DATABASE_URL is required");
  const admin = new URL(configuredUrl);
  admin.pathname = "/postgres";
  admin.searchParams.delete("schema");
  admin.searchParams.delete("options");
  admin.searchParams.delete("application_name");
  const adminUrl = admin.toString();
  const pool = new Pool({ connectionString: adminUrl });
  const database = `race_${randomUUID().replaceAll("-", "")}`;
  const temporaryUrl = temporaryDatabaseUrl(configuredUrl, database);

  try {
    await pool.query(`CREATE DATABASE "${database}"`);
    const deploy = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: temporaryUrl,
        },
      },
    );
    assert.equal(
      deploy.status,
      0,
      `race schema migration failed\n${deploy.stdout}\n${deploy.stderr}`,
    );

    const child = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/verify-races.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: runtimeUrl(configuredUrl, database),
          RACE_ADMIN_URL: temporaryUrl,
          RACE_CHILD: "1",
        },
        timeout: 30_000,
      },
    );
    assert.equal(
      child.status,
      0,
      `live race proof failed\n${child.stdout}\n${child.stderr}`,
    );
    process.stdout.write(child.stdout);
  } finally {
    await pool.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()`,
      [database],
    );
    await pool.query(`DROP DATABASE IF EXISTS "${database}"`);
    await pool.end();
  }
}

(process.env.RACE_CHILD === "1" ? childMain() : parentMain()).catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);

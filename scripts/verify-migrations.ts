import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { Pool, type PoolClient } from "pg";

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
const configuredDatabaseUrl = databaseUrl;

const baseUrl = new URL(configuredDatabaseUrl);
baseUrl.searchParams.delete("schema");
const pool = new Pool({ connectionString: baseUrl.toString() });
const schemas = [
  `migration_fresh_${randomUUID().replaceAll("-", "")}`,
  `migration_legacy_${randomUUID().replaceAll("-", "")}`,
  `migration_blob_supported_${randomUUID().replaceAll("-", "")}`,
  `migration_blob_unsupported_${randomUUID().replaceAll("-", "")}`,
];
const privateEnumMigration = readFileSync(
  "prisma/migrations/20260809010000_private_blob_lifecycle_enum/migration.sql",
  "utf8",
);
const privateMediaMigration = readFileSync(
  "prisma/migrations/20260809011000_private_blob_media/migration.sql",
  "utf8",
);
const prePrivateMigrations = [
  "prisma/migrations/20260808000000_init/migration.sql",
  "prisma/migrations/20260808010000_backfill_place_dedupe_key/migration.sql",
  "prisma/migrations/20260809000000_final_fix_wave/migration.sql",
];

function schemaUrl(schema: string) {
  const url = new URL(configuredDatabaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function deploy(schema: string) {
  return spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: schemaUrl(schema) },
    },
  );
}

async function tables(schema: string) {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name`,
    [schema],
  );
  return result.rows.map(({ table_name }) => table_name);
}

async function schemaClient(schema: string): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query(`SET search_path TO "${schema}"`);
  return client;
}

async function applyPrePrivateMigrations(schema: string) {
  const client = await schemaClient(schema);
  try {
    for (const path of prePrivateMigrations) {
      await client.query(readFileSync(path, "utf8"));
    }
  } finally {
    client.release();
  }
}

async function applyPrivateMigration(client: PoolClient) {
  await client.query(
    "SET placedecide.legacy_blob_store_hosts = 'store.private.blob.vercel-storage.com,store.public.blob.vercel-storage.com'",
  );
  await client.query(privateEnumMigration);
  await client.query(privateMediaMigration);
}

async function insertImageFixture(
  client: PoolClient,
  suffix: string,
  url: string,
) {
  const userId = `user-${suffix}`;
  const placeId = `place-${suffix}`;
  const savedPlaceId = `saved-${suffix}`;
  const imageId = `image-${suffix}`;
  await client.query(
    `INSERT INTO "User" (
       "id", "name", "email", "emailVerified", "username", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, false, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [userId, `User ${suffix}`, `${suffix}@example.com`, `user.${suffix}`],
  );
  await client.query(
    `INSERT INTO "Place" (
       "id", "name", "normalizedName", "address", "normalizedAddress",
       "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      placeId,
      `Place ${suffix}`,
      `place ${suffix}`,
      `${suffix} Test Way`,
      `${suffix} test way`,
    ],
  );
  await client.query(
    `INSERT INTO "UserSavedPlace" (
       "id", "userId", "placeId", "rating", "review", "tags", "sourcePostId",
       "status", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, NULL, NULL, ARRAY[]::TEXT[], NULL, 'SAVED',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [savedPlaceId, userId, placeId],
  );
  await client.query(
    `INSERT INTO "SavedPlaceImage" (
       "id", "savedPlaceId", "blobUploadId", "url", "caption", "sortOrder"
     ) VALUES ($1, $2, NULL, $3, NULL, 0)`,
    [imageId, savedPlaceId, url],
  );
  return { userId, imageId, url };
}

async function main() {
  try {
    for (const schema of schemas) {
      await pool.query(`CREATE SCHEMA "${schema}"`);
    }

    const fresh = deploy(schemas[0]);
    assert.equal(
      fresh.status,
      0,
      `fresh migration failed\n${fresh.stdout}\n${fresh.stderr}`,
    );
    const freshTables = await tables(schemas[0]);
    for (const table of ["User", "Place", "UserSavedPlace", "BlobUpload"]) {
      assert.ok(freshTables.includes(table), `fresh schema missing ${table}`);
    }
    assert.equal(
      (
        await pool.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'BlobUpload'
              AND column_name = 'contentType'`,
          [schemas[0]],
        )
      ).rows[0]?.count,
      "1",
    );
    console.log("PASS fresh temporary schema migration");

    await pool.query(
      `CREATE TABLE "${schemas[1]}"."users" ("id" text PRIMARY KEY);
       CREATE TABLE "${schemas[1]}"."places" ("id" text PRIMARY KEY);
       CREATE TABLE "${schemas[1]}"."user_saved_places" ("id" text PRIMARY KEY);
       CREATE TABLE "${schemas[1]}"."groups" ("id" text PRIMARY KEY);
       CREATE TABLE "${schemas[1]}"."import_batches" ("id" text PRIMARY KEY);`,
    );
    const legacyDeploy = deploy(schemas[1]);
    assert.notEqual(
      legacyDeploy.status,
      0,
      "legacy migration must be rejected",
    );
    assert.match(
      `${legacyDeploy.stdout}\n${legacyDeploy.stderr}`,
      /P3005/,
    );
    const baseline = readFileSync(
      "prisma/migrations/20260808000000_init/migration.sql",
      "utf8",
    );
    await assert.rejects(
      pool.query(`SET search_path TO "${schemas[1]}";\n${baseline}`),
      (error: unknown) =>
        error instanceof Error &&
        /fresh-install-only/.test(error.message) &&
        /groups/.test(error.message) &&
        /import_batches/.test(error.message) &&
        /places/.test(error.message) &&
        /user_saved_places/.test(error.message) &&
        /users/.test(error.message),
    );
    const legacyTables = await tables(schemas[1]);
    for (const table of ["User", "Place", "UserSavedPlace", "BlobUpload"]) {
      assert.equal(
        legacyTables.includes(table),
        false,
        `legacy rejection created ${table}`,
      );
    }
    console.log(
      "PASS representative legacy schema rejected before social tables with mapped-table preflight",
    );

    await applyPrePrivateMigrations(schemas[2]);
    const supported = await schemaClient(schemas[2]);
    try {
      const privateFixture = await insertImageFixture(
        supported,
        "private",
        "https://store.private.blob.vercel-storage.com/places/user-private/private.webp",
      );
      const publicFixture = await insertImageFixture(
        supported,
        "public",
        "https://store.public.blob.vercel-storage.com/places/user-public/public.webp",
      );
      await applyPrivateMigration(supported);

      const rows = await supported.query<{
        imageId: string;
        imageUrl: string;
        blobUploadId: string;
        ownerId: string;
        blobUrl: string | null;
        sourceUrl: string | null;
        pathname: string;
        lifecycle: string;
      }>(
        `SELECT
           image."id" AS "imageId",
           image."url" AS "imageUrl",
           image."blobUploadId",
           blob."ownerId",
           blob."url" AS "blobUrl",
           blob."sourceUrl",
           blob."pathname",
           blob."lifecycle"::text AS "lifecycle"
         FROM "SavedPlaceImage" image
         JOIN "BlobUpload" blob ON blob."id" = image."blobUploadId"
         ORDER BY image."id"`,
      );
      const byImage = new Map(rows.rows.map((row) => [row.imageId, row]));
      const privateRow = byImage.get(privateFixture.imageId);
      const publicRow = byImage.get(publicFixture.imageId);
      assert.ok(privateRow && publicRow);

      assert.equal(privateRow.ownerId, privateFixture.userId);
      assert.equal(privateRow.lifecycle, "PENDING_PRIVATE_COPY");
      assert.equal(privateRow.blobUrl, null);
      assert.equal(privateRow.sourceUrl, privateFixture.url);
      assert.equal(
        privateRow.imageUrl,
        `/api/media/${privateRow.blobUploadId}`,
      );
      console.log(
        "PASS private Blob image backfills exact owner and pending verified conversion",
      );

      assert.equal(publicRow.ownerId, publicFixture.userId);
      assert.equal(publicRow.lifecycle, "PENDING_PRIVATE_COPY");
      assert.equal(publicRow.blobUrl, null);
      assert.equal(publicRow.sourceUrl, publicFixture.url);
      assert.equal(
        publicRow.pathname,
        "places/user-public/legacy/image-public",
      );
      assert.equal(
        publicRow.imageUrl,
        `/api/media/${publicRow.blobUploadId}`,
      );
      console.log(
        "PASS public Blob image enters durable private-copy ledger",
      );
    } finally {
      supported.release();
    }

    await applyPrePrivateMigrations(schemas[3]);
    const unsupported = await schemaClient(schemas[3]);
    try {
      const fixture = await insertImageFixture(
        unsupported,
        "external",
        "https://cdn.example.com/external.webp",
      );
      await assert.rejects(
        applyPrivateMigration(unsupported),
        /Unsupported or foreign SavedPlaceImage URL/,
      );
      const image = await unsupported.query<{
        url: string;
        blobUploadId: string | null;
      }>(
        `SELECT "url", "blobUploadId"
           FROM "SavedPlaceImage"
          WHERE "id" = $1`,
        [fixture.imageId],
      );
      assert.deepEqual(image.rows, [
        { url: fixture.url, blobUploadId: null },
      ]);
      assert.equal(
        (
          await unsupported.query<{ count: string }>(
            `SELECT count(*)::text AS "count" FROM "BlobUpload"`,
          )
        ).rows[0]?.count,
        "0",
      );
      assert.equal(
        (
          await unsupported.query<{ count: string }>(
            `SELECT count(*)::text AS "count"
               FROM information_schema.columns
              WHERE table_schema = $1
                AND table_name = 'BlobUpload'
                AND column_name = 'sourceUrl'`,
            [schemas[3]],
          )
        ).rows[0]?.count,
        "0",
      );
      console.log(
        "PASS unsupported external image aborts before schema or data mutation",
      );
    } finally {
      unsupported.release();
    }
  } finally {
    for (const schema of schemas) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

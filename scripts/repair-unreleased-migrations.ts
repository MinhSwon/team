import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { Pool, type PoolClient } from "pg";

loadEnvFile();

const migrations = [
  {
    name: "20260809010000_private_blob_lifecycle_enum",
    previous:
      "86a912a62804eb41518ab1777d9f7504d8a1b8892b3d60f8ca4da6ac4c14086a",
  },
  {
    name: "20260809011000_private_blob_media",
    previous:
      "fe548034e5bb9342e9386d58c2b4c1f146a177211054a12387788889aad3501f",
  },
  {
    name: "20260809012000_private_blob_hardening",
    previous:
      "f1795882b69dc65f8c022c6586bbd507804d0e8743437cac8fdb2234434a7931",
  },
] as const;

function currentChecksum(name: string): string {
  return createHash("sha256")
    .update(
      readFileSync(`prisma/migrations/${name}/migration.sql`),
    )
    .digest("hex");
}

async function repair(client: PoolClient) {
  const applied = await client.query<{
    migration_name: string;
    checksum: string;
  }>(
    `SELECT "migration_name", "checksum"
       FROM "_prisma_migrations"
      WHERE "migration_name" = ANY($1::text[])
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL`,
    [migrations.map(({ name }) => name)],
  );
  if (applied.rowCount === 0) {
    console.log("No unreleased private Blob migrations are applied");
    return;
  }
  assert.equal(
    applied.rowCount,
    migrations.length,
    "Unreleased private Blob migration history is partial; recreate development database",
  );

  const byName = new Map(
    applied.rows.map((row) => [row.migration_name, row.checksum]),
  );
  const checksums = migrations.map((migration) => ({
    ...migration,
    current: currentChecksum(migration.name),
    applied: byName.get(migration.name),
  }));
  for (const migration of checksums) {
    assert.ok(
      migration.applied === migration.previous ||
        migration.applied === migration.current,
      `Unexpected checksum for ${migration.name}; refusing unreleased history repair`,
    );
  }
  if (checksums.every(({ applied, current }) => applied === current)) {
    console.log("Unreleased private Blob migration history already matches");
    return;
  }

  const counts = await client.query<{
    blob_count: string;
    image_count: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM "BlobUpload") AS "blob_count",
       (SELECT count(*)::text FROM "SavedPlaceImage") AS "image_count"`,
  );
  const count = counts.rows[0];
  assert.ok(count, "Migration repair count query returned no row");
  assert.equal(
    count.blob_count,
    "0",
    "BlobUpload rows exist; recreate development database because erased public references cannot be reconstructed",
  );
  assert.equal(
    count.image_count,
    "0",
    "SavedPlaceImage rows exist; recreate development database because ownership/reference history is ambiguous",
  );

  await client.query(`UPDATE "User" SET "image" = NULL WHERE "image" IS NOT NULL`);
  for (const migration of checksums) {
    await client.query(
      `UPDATE "_prisma_migrations"
          SET "checksum" = $1
        WHERE "migration_name" = $2`,
      [migration.current, migration.name],
    );
  }
  console.log(
    "Repaired pre-release migration checksums after verifying zero BlobUpload and SavedPlaceImage rows",
  );
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Unreleased migration repair is forbidden in production");
  }
  if (process.env.ALLOW_UNRELEASED_MIGRATION_REPAIR !== "1") {
    throw new Error(
      "Set ALLOW_UNRELEASED_MIGRATION_REPAIR=1 for explicit pre-release development repair",
    );
  }
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await repair(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

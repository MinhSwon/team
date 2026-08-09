import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { Pool } from "pg";

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

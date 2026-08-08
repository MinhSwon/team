import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("legacy places POST delegates manual writes to canonical resolution", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /resolvePlace\(\s*\{\s*type:\s*["']manual["']/);
  assert.doesNotMatch(source, /prisma\.place\.create/);
});

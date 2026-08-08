import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("legacy places POST delegates manual writes to canonical resolution", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /resolvePlace\(\s*\{\s*type:\s*["']manual["']/);
  assert.doesNotMatch(source, /prisma\.place\.create/);
});

test("legacy places route rejects oversized query and manual fields", async () => {
  const { GET, POST } = await import("./route");
  const searchResponse = await GET(
    new Request(
      `http://localhost/api/places?query=${"q".repeat(201)}`,
    ),
  );
  const createResponse = await POST(
    new Request("http://localhost/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "n".repeat(161),
        address: "Address",
      }),
    }),
  );

  assert.equal(searchResponse.status, 400);
  assert.equal(createResponse.status, 400);
});

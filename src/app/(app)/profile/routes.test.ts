import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("profile and profile settings routes stay protected without duplicates", () => {
  const app = new URL("../", import.meta.url);
  const unprotected = new URL("../../", import.meta.url);

  for (const path of [
    "profile/page.tsx",
    "profile/[username]/page.tsx",
    "settings/profile/page.tsx",
  ]) {
    assert.equal(existsSync(new URL(path, app)), true, path);
    assert.equal(existsSync(new URL(path, unprotected)), false, path);
  }
});

test("placeholder profile route redirects current user by username", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(source, /requireCurrentUser/);
  assert.match(source, /redirect\(`\/profile\/\$\{/);
  assert.doesNotMatch(source, /<h1[^>]*>Profile<\/h1>/);
});

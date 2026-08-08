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

test("profile settings use refresh-safe uncontrolled fields", () => {
  const source = readFileSync(
    new URL("../settings/profile/ProfileForm.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /useState\(profile\./);
  assert.match(source, /new FormData\(event\.currentTarget\)/);
  assert.match(source, /defaultValue=\{profile\./);
  assert.match(source, /formElement\.reset\(\)/);
  assert.match(source, /Profile updated/);
});

test("profile posts wrap long text and stack date on narrow screens", () => {
  const source = readFileSync(
    new URL("./[username]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /flex min-w-0 flex-col gap-1 sm:flex-row/);
  assert.match(source, /min-w-0 \[overflow-wrap:anywhere\]/);
  assert.match(
    source,
    /min-w-0 \[overflow-wrap:anywhere\][\s\S]*address/,
  );
});

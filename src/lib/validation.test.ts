import assert from "node:assert/strict";
import test from "node:test";

import {
  ValidationError,
  assertRating,
  normalizePlaceText,
  normalizeUsername,
} from "./validation";

test("normalizeUsername trims and lowercases usernames", () => {
  assert.equal(normalizeUsername("  Alice.Smith  "), "alice.smith");
});

test("normalizePlaceText removes Vietnamese accents and collapses whitespace", () => {
  assert.equal(normalizePlaceText("  Cà   phê SỮA  "), "ca phe sua");
});

test("assertRating accepts boundary ratings", () => {
  assert.equal(assertRating(1), 1);
  assert.equal(assertRating(5), 5);
});

test("assertRating accepts an absent rating", () => {
  assert.equal(assertRating(null), null);
  assert.equal(assertRating(undefined), null);
});

test("assertRating rejects invalid ratings", () => {
  for (const value of [0, 6, "5", 1.5]) {
    assert.throws(() => assertRating(value), ValidationError);
  }
});

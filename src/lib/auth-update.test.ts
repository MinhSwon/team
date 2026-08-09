import assert from "node:assert/strict";
import test from "node:test";

test("auth user updates validate supplied identity fields without clobbering partial updates", async () => {
  const auth = await import("./auth") as typeof import("./auth") & {
    sanitizeAuthUserUpdate?: (
      value: Record<string, unknown>,
    ) => Record<string, unknown>;
  };

  assert.equal(typeof auth.sanitizeAuthUserUpdate, "function");
  const sanitize = auth.sanitizeAuthUserUpdate;
  assert.ok(sanitize);

  assert.deepEqual(sanitize({ bio: "unchanged partial field" }), {
    bio: "unchanged partial field",
  });
  assert.deepEqual(sanitize({ name: "  Updated Name  " }), {
    name: "Updated Name",
  });
  assert.deepEqual(sanitize({ username: "  Updated.User  " }), {
    username: "updated.user",
  });
  assert.deepEqual(sanitize({ image: null }), { image: null });
  assert.deepEqual(sanitize({ name: undefined, image: undefined }), {
    name: undefined,
    image: undefined,
  });

  for (const value of [
    { name: "   " },
    { name: "n".repeat(81) },
    { username: "bad username" },
    { image: "https://images.example/avatar.png" },
  ]) {
    assert.throws(() => sanitize(value), /Name|Username|Avatar/);
  }
});

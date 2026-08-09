import assert from "node:assert/strict";
import test from "node:test";

import { PostError } from "@/lib/posts";

import { handleSavedDelete, handleSavedPatch } from "./route";

const context = { params: Promise.resolve({ id: "saved-1" }) };
const notFound = () => {
  throw new PostError("Saved place not found", "NOT_FOUND", 404);
};

test("saved PATCH and DELETE use one opaque not-found response", async () => {
  const dependencies = {
    requireUser: async () => ({ id: "user-2" }),
    updateSavedPlace: async () => notFound(),
    deleteSavedPlace: async () => notFound(),
  };

  const patch = await handleSavedPatch(
    new Request("http://localhost/api/saved/saved-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "VISITED" }),
    }),
    context,
    dependencies,
  );
  const remove = await handleSavedDelete(
    new Request("http://localhost/api/saved/saved-1", {
      method: "DELETE",
    }),
    context,
    dependencies,
  );

  for (const response of [patch, remove]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Saved place not found",
    });
  }
});

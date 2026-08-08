import assert from "node:assert/strict";
import test from "node:test";

import { PlaceResolutionError } from "@/lib/places";

import { handleSavedPost } from "./route";

test("saved route returns recoverable manual confirmation as HTTP 422", async () => {
  const response = await handleSavedPost(
    new Request("http://localhost/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place: { type: "mapsUrl", url: "https://maps.app.goo.gl/test" } }),
    }),
    {
      requireUser: async () => ({ id: "user-1" }),
      saveAndSharePlace: async () => {
        throw new PlaceResolutionError(
          "Confirm this place manually",
          "MANUAL_CONFIRMATION_REQUIRED",
          200,
          { name: "Cafe Central", address: "1 Main Street" },
        );
      },
    },
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Confirm this place manually",
    code: "MANUAL_CONFIRMATION_REQUIRED",
    requiresConfirmation: true,
    place: { name: "Cafe Central", address: "1 Main Street" },
  });
});

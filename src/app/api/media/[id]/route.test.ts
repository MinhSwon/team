import assert from "node:assert/strict";
import test from "node:test";

import { UnauthorizedError } from "@/lib/current-user";

test("private media proxy authorizes every read and disables shared caching", async () => {
  const media = await import("./route").catch(() => null);
  assert.ok(media, "authenticated media route must exist");
  if (!media) return;

  let visible = true;
  let providerCalls = 0;
  const dependencies = {
    requireUser: async () => ({ id: "viewer-1" }),
    findVisibleUpload: async () =>
      visible
        ? {
            pathname: "places/owner-1/upload-1.webp",
            contentType: "image/webp" as const,
          }
        : null,
    get: async (
      pathname: string,
      options: {
        access: string;
        token: string;
        useCache: boolean;
        abortSignal: AbortSignal;
      },
    ) => {
      providerCalls += 1;
      assert.equal(pathname, "places/owner-1/upload-1.webp");
      assert.equal(options.access, "private");
      assert.equal(options.token, "blob-token");
      assert.equal(options.useCache, false);
      assert.ok(options.abortSignal instanceof AbortSignal);
      return {
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
        headers: new Headers(),
        blob: {
          contentType: "image/webp",
          size: 3,
        },
      };
    },
    token: "blob-token",
  };

  const allowed = await media.handleMediaRequest(
    new Request("http://localhost/api/media/upload-1"),
    "upload-1",
    dependencies,
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Cache-Control"), "private, no-store");
  assert.equal(allowed.headers.get("Content-Type"), "image/webp");
  assert.equal(allowed.headers.get("Content-Length"), "3");
  assert.deepEqual(
    new Uint8Array(await allowed.arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );

  visible = false;
  const removed = await media.handleMediaRequest(
    new Request("http://localhost/api/media/upload-1"),
    "upload-1",
    dependencies,
  );
  assert.equal(removed.status, 404);
  assert.deepEqual(await removed.json(), { error: "Media not found" });
  assert.equal(providerCalls, 1, "provider read must stop after access removal");
});

test("private media proxy authenticates before lookup", async () => {
  const media = await import("./route").catch(() => null);
  assert.ok(media, "authenticated media route must exist");
  if (!media) return;

  let lookupCalls = 0;
  const response = await media.handleMediaRequest(
    new Request("http://localhost/api/media/upload-1"),
    "upload-1",
    {
      requireUser: async () => {
        throw new UnauthorizedError();
      },
      findVisibleUpload: async () => {
        lookupCalls += 1;
        return null;
      },
      get: async () => null,
      token: "blob-token",
    },
  );

  assert.equal(response.status, 401);
  assert.equal(lookupCalls, 0);
});

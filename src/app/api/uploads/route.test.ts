import assert from "node:assert/strict";
import test from "node:test";

import { UnauthorizedError } from "@/lib/current-user";

import {
  handleUpload,
  type UploadDependencies,
  type UploadPut,
} from "./route";

function requestWith(file?: File): Request {
  const body = new FormData();
  if (file) body.set("image", file);
  return new Request("http://localhost/api/uploads", {
    method: "POST",
    body,
  });
}

function dependencies(
  overrides: Partial<UploadDependencies> = {},
): UploadDependencies {
  return {
    requireUser: async () => ({ id: "user-1" }),
    token: "blob-token",
    put: async () => ({ url: "https://blob.example/image.png" }),
    ...overrides,
  };
}

test("handleUpload authenticates before accepting an image", async () => {
  let putCalls = 0;
  const put: UploadPut = async () => {
    putCalls += 1;
    return { url: "https://blob.example/image.png" };
  };

  const response = await handleUpload(
    requestWith(new File(["image"], "place.png", { type: "image/png" })),
    dependencies({
      requireUser: async () => {
        throw new UnauthorizedError();
      },
      put,
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(putCalls, 0);
});

test("handleUpload reports missing Blob configuration clearly", async () => {
  const response = await handleUpload(
    requestWith(new File(["image"], "place.png", { type: "image/png" })),
    dependencies({ token: undefined }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Image uploads are not configured",
  });
});

test("handleUpload rejects unsupported and oversized files", async () => {
  const unsupported = await handleUpload(
    requestWith(new File(["gif"], "place.gif", { type: "image/gif" })),
    dependencies(),
  );
  assert.equal(unsupported.status, 415);

  const oversized = await handleUpload(
    requestWith(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "place.webp", {
        type: "image/webp",
      }),
    ),
    dependencies(),
  );
  assert.equal(oversized.status, 413);
});

test("handleUpload stores one allowed image under the current user", async () => {
  let pathname = "";
  let contentType = "";
  let token = "";
  const put: UploadPut = async (nextPathname, body, options) => {
    pathname = nextPathname;
    contentType = options.contentType;
    token = options.token;
    assert.ok(body instanceof File);
    assert.equal(options.access, "public");
    assert.equal(options.addRandomSuffix, true);
    return { url: "https://blob.example/place.webp" };
  };

  const response = await handleUpload(
    requestWith(new File(["webp"], "My Place.webp", { type: "image/webp" })),
    dependencies({ put }),
  );

  assert.equal(response.status, 201);
  assert.match(pathname, /^places\/user-1\/my-place\.webp$/);
  assert.equal(contentType, "image/webp");
  assert.equal(token, "blob-token");
  assert.deepEqual(await response.json(), {
    url: "https://blob.example/place.webp",
  });
});

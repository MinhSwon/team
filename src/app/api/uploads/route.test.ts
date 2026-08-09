import assert from "node:assert/strict";
import test from "node:test";

import { UnauthorizedError } from "@/lib/current-user";

import {
  handleUpload,
  type UploadDependencies,
  type UploadPut,
} from "./route";

const signatures = {
  "image/jpeg": new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
  "image/png": new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]),
  "image/webp": new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]),
} satisfies Record<string, Uint8Array>;

function imageFile(
  type: keyof typeof signatures,
  name = "place",
  extraBytes = 0,
): File {
  return new File(
    [signatures[type], new Uint8Array(extraBytes)],
    `${name}.${type.split("/")[1]}`,
    { type },
  );
}

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
    reserveUpload: async (_ownerId, pathname) => ({
      id: "upload-1",
      pathname,
    }),
    put: async () => ({
      url: "https://store.private.blob.vercel-storage.com/image.png",
      pathname: "places/user-1/image.png",
    }),
    completeUpload: async (id) => ({
      id,
      url: `/api/media/${id}`,
    }),
    cancelReservation: async () => {},
    queueDeletion: async () => {},
    del: async () => {},
    rateLimit: async () => {},
    ...overrides,
  };
}

test("handleUpload authenticates before accepting an image", async () => {
  let putCalls = 0;
  const put: UploadPut = async () => {
    putCalls += 1;
    return {
      url: "https://blob.example/image.png",
      pathname: "places/user-1/image.png",
    };
  };

  const response = await handleUpload(
    requestWith(imageFile("image/png")),
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
    requestWith(imageFile("image/png")),
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
    requestWith(imageFile("image/webp", "place", 5 * 1024 * 1024)),
    dependencies(),
  );
  assert.equal(oversized.status, 413);
});

test("handleUpload rejects files whose bytes do not match the declared image type", async () => {
  let putCalls = 0;
  const response = await handleUpload(
    requestWith(
      new File(["<script>alert(1)</script>"], "place.png", {
        type: "image/png",
      }),
    ),
    dependencies({
      put: async () => {
        putCalls += 1;
        return {
          url: "https://blob.example/image.png",
          pathname: "places/user-1/image.png",
        };
      },
    }),
  );

  assert.equal(response.status, 415);
  assert.equal(putCalls, 0);
});

test("handleUpload rejects a valid image signature under the wrong MIME type", async () => {
  const response = await handleUpload(
    requestWith(
      new File([signatures["image/jpeg"]], "place.png", {
        type: "image/png",
      }),
    ),
    dependencies(),
  );

  assert.equal(response.status, 415);
});

test("handleUpload stores one private image and exposes only its internal media URL", async () => {
  let pathname = "";
  let contentType = "";
  let token = "";
  const put: UploadPut = async (nextPathname, body, options) => {
    pathname = nextPathname;
    contentType = options.contentType;
    token = options.token;
    assert.ok(body instanceof File);
    assert.equal(options.access, "private");
    assert.equal(options.addRandomSuffix, false);
    return {
      url: "https://store.private.blob.vercel-storage.com/place.webp",
      pathname: nextPathname,
    };
  };

  const response = await handleUpload(
    requestWith(imageFile("image/webp", "My Place")),
    dependencies({ put }),
  );

  assert.equal(response.status, 201);
  assert.match(
    pathname,
    /^places\/user-1\/[0-9a-f-]+-my-place\.webp$/,
  );
  assert.equal(contentType, "image/webp");
  assert.equal(token, "blob-token");
  assert.deepEqual(await response.json(), {
    id: "upload-1",
    url: "/api/media/upload-1",
  });
});

test("handleUpload accepts JPEG, PNG, and WebP signatures", async () => {
  for (const type of Object.keys(signatures) as Array<
    keyof typeof signatures
  >) {
    const response = await handleUpload(
      requestWith(imageFile(type)),
      dependencies(),
    );
    assert.equal(response.status, 201, type);
  }
});

test("handleUpload reports malformed multipart data as a validation error", async () => {
  const request = new Request("http://localhost/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=broken" },
    body: "not multipart",
  });

  const response = await handleUpload(request, dependencies());

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid multipart form data",
  });
});

test("handleUpload reports Blob TypeError as provider failure", async () => {
  const response = await handleUpload(
    requestWith(imageFile("image/png")),
    dependencies({
      put: async () => {
        throw new TypeError("network failed");
      },
    }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "Image upload failed",
  });
});

test("handleUpload deletes Blob when ownership persistence fails", async () => {
  const deleted: string[] = [];
  const response = await handleUpload(
    requestWith(imageFile("image/png")),
    dependencies({
      put: async () => ({
        url: "https://blob.example/orphan.png",
        pathname: "places/user-1/orphan.png",
      }),
      completeUpload: async () => {
        throw new Error("database unavailable");
      },
      del: async (url) => {
        deleted.push(url);
      },
    }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(deleted, ["https://blob.example/orphan.png"]);
});

test("handleUpload creates durable ownership before provider write", async () => {
  const events: string[] = [];
  const response = await handleUpload(
    requestWith(imageFile("image/png")),
    {
      requireUser: async () => ({ id: "user-1" }),
      token: "blob-token",
      reserveUpload: async (
        ownerId: string,
        pathname: string,
      ) => {
        events.push(`reserve:${ownerId}:${pathname}`);
        return { id: "upload-1", pathname };
      },
      put: async (pathname: string) => {
        events.push(`put:${pathname}`);
        return {
          url: "https://store.private.blob.vercel-storage.com/image.png",
          pathname,
        };
      },
      completeUpload: async (
        id: string,
        blob: { url: string; pathname: string },
      ) => {
        events.push(`complete:${id}:${blob.pathname}`);
        return { id, url: `/api/media/${id}` };
      },
      cancelReservation: async (id: string) => {
        events.push(`cancel:${id}`);
      },
      queueDeletion: async (id: string) => {
        events.push(`queue:${id}`);
      },
      del: async () => {},
      rateLimit: async () => {},
    } as never,
  );

  assert.equal(response.status, 201);
  assert.match(events[0] ?? "", /^reserve:user-1:/);
  assert.match(events[1] ?? "", /^put:/);
  assert.match(events[2] ?? "", /^complete:upload-1:/);
  assert.equal(events.some((event) => event.startsWith("cancel:")), false);
});

test("failed completion leaves a durable deletion record when provider deletion also fails", async () => {
  const events: string[] = [];
  const response = await handleUpload(
    requestWith(imageFile("image/png")),
    {
      requireUser: async () => ({ id: "user-1" }),
      token: "blob-token",
      reserveUpload: async (_ownerId: string, pathname: string) => {
        events.push("reserve");
        return { id: "upload-1", pathname };
      },
      put: async (pathname: string) => ({
        url: "https://store.private.blob.vercel-storage.com/image.png",
        pathname,
      }),
      completeUpload: async () => {
        throw new Error("database unavailable");
      },
      cancelReservation: async () => {
        events.push("cancel");
      },
      queueDeletion: async (
        id: string,
        blob: { url: string; pathname: string },
      ) => {
        events.push(`queue:${id}:${blob.pathname}`);
      },
      del: async () => {
        events.push("delete");
        throw new Error("provider unavailable");
      },
      rateLimit: async () => {},
    } as never,
  );

  assert.equal(response.status, 502);
  assert.deepEqual(events.slice(0, 2), ["reserve", "delete"]);
  assert.match(events[2] ?? "", /^queue:upload-1:/);
  assert.equal(events.includes("cancel"), false);
});

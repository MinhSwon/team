import { randomUUID } from "node:crypto";

import { del, put } from "@vercel/blob";

import {
  cancelBlobReservation,
  completeBlobUpload,
  queueBlobDeletion,
  reserveBlobUpload,
  type BlobReservation,
  type UploadedBlob,
} from "@/lib/blob-uploads";
import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  enforceRateLimit,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";

export type UploadPut = (
  pathname: string,
  body: File,
  options: {
    access: "private";
    addRandomSuffix: false;
    contentType: string;
    token: string;
    abortSignal: AbortSignal;
  },
) => Promise<{ url: string; pathname: string }>;

export type UploadDependencies = {
  requireUser: () => Promise<{ id: string }>;
  reserveUpload: (
    ownerId: string,
    pathname: string,
  ) => Promise<BlobReservation>;
  put: UploadPut;
  completeUpload: (
    id: string,
    blob: { url: string; pathname: string },
    contentType: ImageType,
  ) => Promise<UploadedBlob>;
  cancelReservation: (id: string) => Promise<void>;
  queueDeletion: (
    id: string,
    blob: { url: string; pathname: string },
    error?: unknown,
  ) => Promise<void>;
  del: (
    url: string,
    options?: { abortSignal: AbortSignal },
  ) => Promise<void>;
  rateLimit: (request: Request, userId: string) => Promise<void>;
  token?: string;
};

const maxImageBytes = 5 * 1024 * 1024;
const maxUploadRequestBytes = maxImageBytes + 256 * 1024;
const imageExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
type ImageType = keyof typeof imageExtensions;

function isImageType(type: string): type is ImageType {
  return Object.hasOwn(imageExtensions, type);
}

function hasImageSignature(type: ImageType, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (type === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function uploadPath(
  userId: string,
  id: string,
  file: File,
  type: ImageType,
): string {
  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "place";

  return `places/${userId}/${id}-${base}.${imageExtensions[type]}`;
}

export async function handleUpload(
  request: Request,
  dependencies: UploadDependencies,
): Promise<Response> {
  let currentUser: { id: string };
  try {
    currentUser = await dependencies.requireUser();
    await dependencies.rateLimit(request, currentUser.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RateLimitError) return rateLimitResponse(error);
    return Response.json({ error: "Image upload failed" }, { status: 502 });
  }

  if (!dependencies.token) {
    return Response.json(
      { error: "Image uploads are not configured" },
      { status: 503 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) {
      return Response.json(
        { error: "Invalid Content-Length" },
        { status: 400 },
      );
    }
    if (BigInt(contentLength) > BigInt(maxUploadRequestBytes)) {
      return Response.json(
        { error: "Upload request is too large" },
        { status: 413 },
      );
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const images = form.getAll("image");
  if (images.length !== 1 || !(images[0] instanceof File)) {
    return Response.json(
      { error: "One image is required" },
      { status: 400 },
    );
  }

  const file = images[0];
  if (!isImageType(file.type)) {
    return Response.json(
      { error: "Image must be JPEG, PNG, or WebP" },
      { status: 415 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "Image is empty" }, { status: 400 });
  }
  if (file.size > maxImageBytes) {
    return Response.json(
      { error: "Image must be 5 MB or smaller" },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasImageSignature(file.type, bytes)) {
    return Response.json(
      { error: "Image bytes do not match its file type" },
      { status: 415 },
    );
  }

  let reservation: BlobReservation;
  try {
    reservation = await dependencies.reserveUpload(
      currentUser.id,
      uploadPath(currentUser.id, randomUUID(), file, file.type),
    );
  } catch {
    return Response.json({ error: "Image upload failed" }, { status: 502 });
  }

  let blob: { url: string; pathname: string };
  try {
    blob = await dependencies.put(
      reservation.pathname,
      file,
      {
        access: "private",
        addRandomSuffix: false,
        contentType: file.type,
        token: dependencies.token,
        abortSignal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return Response.json({ error: "Image upload failed" }, { status: 502 });
  }

  try {
    const upload = await dependencies.completeUpload(
      reservation.id,
      blob,
      file.type,
    );
    return Response.json(upload, { status: 201 });
  } catch {
    try {
      await dependencies.del(blob.url, {
        abortSignal: AbortSignal.timeout(30_000),
      });
      try {
        await dependencies.cancelReservation(reservation.id);
      } catch {}
    } catch (deleteError) {
      try {
        await dependencies.queueDeletion(
          reservation.id,
          blob,
          deleteError,
        );
      } catch {}
    }
    return Response.json({ error: "Image upload failed" }, { status: 502 });
  }
}

export function POST(request: Request): Promise<Response> {
  return handleUpload(request, {
    requireUser: requireCurrentUser,
    reserveUpload: reserveBlobUpload,
    put: (pathname, body, options) => put(pathname, body, options),
    completeUpload: completeBlobUpload,
    cancelReservation: cancelBlobReservation,
    queueDeletion: queueBlobDeletion,
    del: (url, options) =>
      del(url, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        ...options,
      }),
    rateLimit: (nextRequest, userId) =>
      enforceRateLimit(nextRequest, userId, "upload"),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

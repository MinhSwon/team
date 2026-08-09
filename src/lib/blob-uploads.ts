import type { BlobLifecycle } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/media";

export type BlobReservation = {
  id: string;
  pathname: string;
};

export type UploadedBlob = {
  id: string;
  url: string;
};

export type TrustedImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type CleanupCandidate = {
  id: string;
  url: string | null;
  sourceUrl: string | null;
  pathname: string;
  contentType: TrustedImageContentType | null;
  lifecycle: BlobLifecycle;
  createdAt: Date;
  leaseUntil: Date;
};

export type ConversionCandidate = {
  id: string;
  ownerId: string;
  url: string | null;
  sourceUrl: string;
  pathname: string;
  contentType: TrustedImageContentType | null;
  lifecycle: BlobLifecycle;
  leaseUntil: Date;
};

export interface BlobCleanupStore {
  claimCleanupCandidates(
    now: Date,
    orphanCutoff: Date,
    leaseUntil: Date,
    take: number,
  ): Promise<CleanupCandidate[]>;
  deleteClaimedRecord(id: string, leaseUntil: Date): Promise<boolean>;
  releaseDeleteClaim(
    id: string,
    leaseUntil: Date,
    error: string,
  ): Promise<void>;
}

export interface BlobConversionStore {
  claimConversionCandidates(
    now: Date,
    leaseUntil: Date,
    take: number,
  ): Promise<ConversionCandidate[]>;
  recordPrivateCopy(
    id: string,
    leaseUntil: Date,
    blob: {
      url: string;
      pathname: string;
      contentType: TrustedImageContentType;
    },
  ): Promise<boolean>;
  finishConversion(id: string, leaseUntil: Date): Promise<boolean>;
  releaseConversionClaim(
    id: string,
    leaseUntil: Date,
    privateReady: boolean,
    error: string,
  ): Promise<void>;
}

const leaseMs = 5 * 60 * 1000;
const orphanMs = 24 * 60 * 60 * 1000;
const providerTimeoutMs = 30 * 1000;
const maxLegacyImageBytes = 5 * 1024 * 1024;

const imageMagicTypes: readonly TrustedImageContentType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function trustedLegacyBlobSource(
  value: string,
  allowedHosts: readonly string[],
): { access: "public" | "private" } | null {
  const normalizedHosts = new Set(
    allowedHosts.map((host) => host.trim().toLowerCase()),
  );
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const access = hostname.endsWith(".private.blob.vercel-storage.com")
      ? "private"
      : hostname.endsWith(".public.blob.vercel-storage.com")
        ? "public"
        : null;
    return url.protocol === "https:" &&
      access &&
      normalizedHosts.has(hostname) &&
      url.pathname.length > 1
      ? { access }
      : null;
  } catch {
    return null;
  }
}

export function isTrustedLegacyBlobUrl(
  value: string,
  allowedHosts: readonly string[],
): boolean {
  return trustedLegacyBlobSource(value, allowedHosts) !== null;
}

function configuredLegacyBlobHosts(): string[] {
  return (process.env.LEGACY_BLOB_STORE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function imageTypeFromBytes(bytes: Uint8Array): TrustedImageContentType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function isMissingBlobError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: number; statusCode?: number; name?: string };
  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    candidate.name === "BlobNotFoundError"
  );
}

function deadlineSignal(timeoutMs = providerTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  timeoutMs = providerTimeoutMs,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const deadline = deadlineSignal(timeoutMs);
  let abortReject: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortReject = reject;
  });
  const onAbort = () =>
    abortReject?.(deadline.signal.reason ?? new Error("Blob read timed out"));
  deadline.signal.addEventListener("abort", onAbort, { once: true });

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxLegacyImageBytes) {
        throw new Error("Legacy image exceeds 5 MB");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.clear();
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function withProviderDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = providerTimeoutMs,
): Promise<T> {
  const deadline = deadlineSignal(timeoutMs);
  let abortReject: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortReject = reject;
  });
  const onAbort = () =>
    abortReject?.(deadline.signal.reason ?? new Error("Blob provider timed out"));
  deadline.signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([operation(deadline.signal), aborted]);
  } finally {
    deadline.signal.removeEventListener("abort", onAbort);
    deadline.clear();
  }
}

async function deleteIdempotently(
  del: (urlOrPathname: string, options?: { abortSignal: AbortSignal }) => Promise<void>,
  reference: string,
  timeoutMs = providerTimeoutMs,
): Promise<void> {
  try {
    await withProviderDeadline(
      (abortSignal) => del(reference, { abortSignal }),
      timeoutMs,
    );
  } catch (error) {
    if (!isMissingBlobError(error)) throw error;
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

const defaultCleanupStore: BlobCleanupStore = {
  claimCleanupCandidates: async (now, orphanCutoff, leaseUntil, take) =>
    prisma.$queryRaw<CleanupCandidate[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
         FROM "BlobUpload"
         WHERE (
           (
             "lifecycle" = 'PENDING_DELETE'
             AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
           )
           OR (
             "lifecycle" IN ('RESERVED', 'UPLOADED')
             AND "createdAt" < ${orphanCutoff}
           )
           OR (
             "lifecycle" = 'DELETING'
             AND "leaseUntil" < ${now}
           )
         )
         ORDER BY "createdAt" ASC, "id" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT ${take}
      )
      UPDATE "BlobUpload" blob
         SET "lifecycle" = 'DELETING',
             "leaseUntil" = ${leaseUntil},
             "deleteAttempts" = blob."deleteAttempts" + 1,
             "lastError" = NULL,
             "updatedAt" = ${now}
        FROM candidates
       WHERE blob."id" = candidates."id"
      RETURNING
        blob."id",
        blob."url",
        blob."sourceUrl",
        blob."pathname",
        blob."contentType",
        blob."lifecycle",
        blob."createdAt",
        blob."leaseUntil"
    `),
  deleteClaimedRecord: async (id, leaseUntil) => {
    const result = await prisma.blobUpload.deleteMany({
      where: { id, lifecycle: "DELETING", leaseUntil },
    });
    return result.count === 1;
  },
  releaseDeleteClaim: async (id, leaseUntil, error) => {
    await prisma.blobUpload.updateMany({
      where: { id, lifecycle: "DELETING", leaseUntil },
      data: {
        lifecycle: "PENDING_DELETE",
        leaseUntil: null,
        lastError: error,
      },
    });
  },
};

const defaultConversionStore: BlobConversionStore = {
  claimConversionCandidates: async (now, leaseUntil, take) =>
    prisma.$queryRaw<ConversionCandidate[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
          FROM "BlobUpload"
         WHERE (
           "lifecycle" IN ('PENDING_PRIVATE_COPY', 'PENDING_PUBLIC_DELETE')
           OR (
             "lifecycle" = 'CONVERTING'
             AND "leaseUntil" < ${now}
           )
         )
           AND "sourceUrl" IS NOT NULL
         ORDER BY "createdAt" ASC, "id" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT ${take}
      )
      UPDATE "BlobUpload" blob
         SET "lifecycle" = 'CONVERTING',
             "leaseUntil" = ${leaseUntil},
             "lastError" = NULL,
             "updatedAt" = ${now}
        FROM candidates
       WHERE blob."id" = candidates."id"
      RETURNING
        blob."id",
        blob."ownerId",
        blob."url",
        blob."sourceUrl",
        blob."pathname",
        blob."contentType",
        blob."lifecycle",
        blob."leaseUntil"
    `),
  recordPrivateCopy: async (id, leaseUntil, blob) => {
    const result = await prisma.blobUpload.updateMany({
      where: {
        id,
        lifecycle: { in: ["CONVERTING", "PENDING_DELETE"] },
        leaseUntil,
      },
      data: {
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType,
      },
    });
    return result.count === 1;
  },
  finishConversion: async (id, leaseUntil) => {
    const result = await prisma.blobUpload.updateMany({
      where: { id, lifecycle: "CONVERTING", leaseUntil },
      data: {
        sourceUrl: null,
        lifecycle: "CLAIMED",
        leaseUntil: null,
        lastError: null,
      },
    });
    return result.count === 1;
  },
  releaseConversionClaim: async (
    id,
    leaseUntil,
    privateReady,
    error,
  ) => {
    await prisma.blobUpload.updateMany({
      where: { id, lifecycle: "CONVERTING", leaseUntil },
      data: {
        lifecycle: privateReady
          ? "PENDING_PUBLIC_DELETE"
          : "PENDING_PRIVATE_COPY",
        leaseUntil: null,
        lastError: error,
      },
    });
  },
};

export function reserveBlobUpload(
  ownerId: string,
  pathname: string,
): Promise<BlobReservation> {
  return prisma.blobUpload.create({
    data: {
      ownerId,
      pathname,
      lifecycle: "RESERVED",
    },
    select: { id: true, pathname: true },
  });
}

export async function completeBlobUpload(
  id: string,
  blob: { url: string; pathname: string },
  contentType: TrustedImageContentType,
): Promise<UploadedBlob> {
  const result = await prisma.blobUpload.updateMany({
    where: { id, pathname: blob.pathname, lifecycle: "RESERVED" },
    data: {
      url: blob.url,
      contentType,
      lifecycle: "UPLOADED",
      lastError: null,
    },
  });
  if (result.count !== 1) throw new Error("Blob reservation not found");
  return { id, url: mediaUrl(id) };
}

export async function cancelBlobReservation(id: string): Promise<void> {
  await prisma.blobUpload.deleteMany({
    where: { id, lifecycle: "RESERVED" },
  });
}

export async function queueBlobDeletion(
  id: string,
  blob: { url: string; pathname: string },
  error?: unknown,
): Promise<void> {
  await prisma.blobUpload.updateMany({
    where: { id, lifecycle: "RESERVED" },
    data: {
      url: blob.url,
      pathname: blob.pathname,
      lifecycle: "PENDING_DELETE",
      lastError: error ? errorText(error) : null,
    },
  });
}

export async function cleanupBlobUploads({
  now = new Date(),
  store = defaultCleanupStore,
  del,
  take = 100,
  timeoutMs = providerTimeoutMs,
}: {
  now?: Date;
  store?: BlobCleanupStore;
  del: (
    urlOrPathname: string,
    options?: { abortSignal: AbortSignal },
  ) => Promise<void>;
  take?: number;
  timeoutMs?: number;
}): Promise<{ deleted: number; failed: number }> {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const candidates = await store.claimCleanupCandidates(
    now,
    new Date(now.getTime() - orphanMs),
    leaseUntil,
    take,
  );
  const outcomes = await Promise.all(
    candidates.map(async (candidate) => {
      const references = new Set<string>([
        candidate.url ?? candidate.pathname,
        ...(candidate.sourceUrl ? [candidate.sourceUrl] : []),
      ]);
      try {
        await Promise.all(
          [...references].map((reference) =>
            deleteIdempotently(del, reference, timeoutMs),
          ),
        );
        return (await store.deleteClaimedRecord(
          candidate.id,
          candidate.leaseUntil,
        ))
          ? ("deleted" as const)
          : null;
      } catch (error) {
        await store.releaseDeleteClaim(
          candidate.id,
          candidate.leaseUntil,
          errorText(error),
        );
        return "failed" as const;
      }
    }),
  );

  return {
    deleted: outcomes.filter((outcome) => outcome === "deleted").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}

export async function convertLegacyBlobUploads({
  now = new Date(),
  store = defaultConversionStore,
  get,
  put,
  del,
  token,
  take = 4,
  allowedHosts = configuredLegacyBlobHosts(),
  timeoutMs = providerTimeoutMs,
}: {
  now?: Date;
  store?: BlobConversionStore;
  get: (
    url: string,
    options: {
      access: "public" | "private";
      token: string;
      useCache: false;
      abortSignal: AbortSignal;
    },
  ) => Promise<{
    statusCode: number;
    stream: ReadableStream<Uint8Array> | null;
    blob: { contentType: string | null; size: number | null };
  } | null>;
  put: (
    pathname: string,
    body: Uint8Array,
    options: {
      access: "private";
      addRandomSuffix: false;
      allowOverwrite: true;
      contentType: string;
      token: string;
      abortSignal: AbortSignal;
    },
  ) => Promise<{ url: string; pathname: string }>;
  del: (
    url: string,
    options?: { abortSignal: AbortSignal },
  ) => Promise<void>;
  token: string;
  take?: number;
  allowedHosts?: readonly string[];
  timeoutMs?: number;
}): Promise<{ converted: number; failed: number }> {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const candidates = await store.claimConversionCandidates(
    now,
    leaseUntil,
    take,
  );
  let converted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    let privateReady = Boolean(candidate.url);
    try {
      if (!privateReady) {
        const sourceDescriptor = trustedLegacyBlobSource(
          candidate.sourceUrl,
          allowedHosts,
        );
        if (!sourceDescriptor) {
          throw new Error("Legacy Blob source host is not owned");
        }
        const source = await withProviderDeadline(
          (abortSignal) =>
            get(candidate.sourceUrl, {
              access: sourceDescriptor.access,
              token,
              useCache: false,
              abortSignal,
            }),
          timeoutMs,
        );
        if (!source || source.statusCode !== 200 || !source.stream) {
          throw new Error("Legacy Blob source not found");
        }
        if (
          source.blob.size !== null &&
          source.blob.size > maxLegacyImageBytes
        ) {
          throw new Error("Legacy image exceeds 5 MB");
        }
        const bytes = await readBoundedStream(source.stream, timeoutMs);
        const contentType = imageTypeFromBytes(bytes);
        if (!contentType || !imageMagicTypes.includes(contentType)) {
          throw new Error("Legacy image bytes are not an allowed image");
        }
        const privateBlob = await withProviderDeadline(
          (abortSignal) =>
            put(candidate.pathname, bytes, {
              access: "private",
              addRandomSuffix: false,
              allowOverwrite: true,
              contentType,
              token,
              abortSignal,
            }),
          timeoutMs,
        );
        if (
          !(await store.recordPrivateCopy(
            candidate.id,
            candidate.leaseUntil,
            { ...privateBlob, contentType },
          ))
        ) {
          throw new Error("Blob conversion lease lost");
        }
        privateReady = true;
      }

      await deleteIdempotently(del, candidate.sourceUrl, timeoutMs);
      if (
        !(await store.finishConversion(
          candidate.id,
          candidate.leaseUntil,
        ))
      ) {
        throw new Error("Blob conversion lease lost");
      }
      converted += 1;
    } catch (error) {
      await store.releaseConversionClaim(
        candidate.id,
        candidate.leaseUntil,
        privateReady,
        errorText(error),
      );
      failed += 1;
    }
  }

  return { converted, failed };
}

export function isBlobLifecycle(value: string): value is BlobLifecycle {
  return [
    "RESERVED",
    "UPLOADED",
    "CLAIMED",
    "PENDING_PRIVATE_COPY",
    "CONVERTING",
    "PENDING_PUBLIC_DELETE",
    "PENDING_DELETE",
    "DELETING",
  ].includes(value);
}

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

export type CleanupCandidate = {
  id: string;
  url: string | null;
  sourceUrl: string | null;
  pathname: string;
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
    blob: { url: string; pathname: string },
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
           "lifecycle" = 'PENDING_DELETE'
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
        blob."lifecycle",
        blob."leaseUntil"
    `),
  recordPrivateCopy: async (id, leaseUntil, blob) => {
    const result = await prisma.blobUpload.updateMany({
      where: { id, lifecycle: "CONVERTING", leaseUntil },
      data: { url: blob.url, pathname: blob.pathname },
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
): Promise<UploadedBlob> {
  const result = await prisma.blobUpload.updateMany({
    where: { id, pathname: blob.pathname, lifecycle: "RESERVED" },
    data: {
      url: blob.url,
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
}: {
  now?: Date;
  store?: BlobCleanupStore;
  del: (urlOrPathname: string) => Promise<void>;
  take?: number;
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
        await Promise.all([...references].map((reference) => del(reference)));
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
  take = 100,
}: {
  now?: Date;
  store?: BlobConversionStore;
  get: (
    url: string,
    options: {
      access: "public";
      token: string;
      useCache: false;
    },
  ) => Promise<{
    statusCode: number;
    stream: ReadableStream<Uint8Array> | null;
    blob: { contentType: string | null };
  } | null>;
  put: (
    pathname: string,
    body: ReadableStream<Uint8Array>,
    options: {
      access: "private";
      addRandomSuffix: false;
      allowOverwrite: true;
      contentType: string;
      token: string;
    },
  ) => Promise<{ url: string; pathname: string }>;
  del: (url: string) => Promise<void>;
  token: string;
  take?: number;
}): Promise<{ converted: number; failed: number }> {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const candidates = await store.claimConversionCandidates(
    now,
    leaseUntil,
    take,
  );
  const outcomes = await Promise.all(
    candidates.map(async (candidate) => {
      let privateReady = Boolean(candidate.url);
      try {
        if (!privateReady) {
          const source = await get(candidate.sourceUrl, {
            access: "public",
            token,
            useCache: false,
          });
          if (
            !source ||
            source.statusCode !== 200 ||
            !source.stream ||
            !source.blob.contentType
          ) {
            throw new Error("Legacy Blob source not found");
          }
          const privateBlob = await put(candidate.pathname, source.stream, {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: source.blob.contentType,
            token,
          });
          if (
            !(await store.recordPrivateCopy(
              candidate.id,
              candidate.leaseUntil,
              privateBlob,
            ))
          ) {
            throw new Error("Blob conversion lease lost");
          }
          privateReady = true;
        }

        await del(candidate.sourceUrl);
        if (
          !(await store.finishConversion(
            candidate.id,
            candidate.leaseUntil,
          ))
        ) {
          throw new Error("Blob conversion lease lost");
        }
        return "converted" as const;
      } catch (error) {
        await store.releaseConversionClaim(
          candidate.id,
          candidate.leaseUntil,
          privateReady,
          errorText(error),
        );
        return "failed" as const;
      }
    }),
  );

  return {
    converted: outcomes.filter((outcome) => outcome === "converted").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
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

import type { BlobLifecycle, BlobUpload } from "@prisma/client";

import { prisma } from "@/lib/db";

export type UploadedBlob = Pick<BlobUpload, "id" | "url">;
export type CleanupCandidate = Pick<
  BlobUpload,
  "id" | "url" | "lifecycle" | "createdAt"
>;

export interface BlobCleanupStore {
  listCleanupCandidates(
    orphanCutoff: Date,
    take: number,
  ): Promise<CleanupCandidate[]>;
  markPendingDelete(id: string): Promise<boolean>;
  deleteRecord(id: string): Promise<void>;
}

const defaultCleanupStore: BlobCleanupStore = {
  listCleanupCandidates: (orphanCutoff, take) =>
    prisma.blobUpload.findMany({
      where: {
        OR: [
          { lifecycle: "PENDING_DELETE" },
          { lifecycle: "UPLOADED", createdAt: { lt: orphanCutoff } },
        ],
      },
      select: {
        id: true,
        url: true,
        lifecycle: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    }),
  markPendingDelete: async (id) => {
    const result = await prisma.blobUpload.updateMany({
      where: {
        id,
        lifecycle: { in: ["UPLOADED", "PENDING_DELETE"] },
      },
      data: { lifecycle: "PENDING_DELETE" },
    });
    return result.count === 1;
  },
  deleteRecord: async (id) => {
    await prisma.blobUpload.delete({ where: { id } });
  },
};

export function recordUploadedBlob(
  ownerId: string,
  blob: { url: string; pathname: string },
): Promise<UploadedBlob> {
  return prisma.blobUpload.create({
    data: {
      ownerId,
      url: blob.url,
      pathname: blob.pathname,
    },
    select: { id: true, url: true },
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
  del: (url: string) => Promise<void>;
  take?: number;
}): Promise<{ deleted: number; failed: number }> {
  const candidates = await store.listCleanupCandidates(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    take,
  );
  const outcomes = await Promise.all(
    candidates.map(async (candidate) => {
      if (!(await store.markPendingDelete(candidate.id))) return null;
      try {
        await del(candidate.url);
        await store.deleteRecord(candidate.id);
        return "deleted" as const;
      } catch {
        return "failed" as const;
      }
    }),
  );

  return {
    deleted: outcomes.filter((outcome) => outcome === "deleted").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}

export function isBlobLifecycle(
  value: string,
): value is BlobLifecycle {
  return ["UPLOADED", "CLAIMED", "PENDING_DELETE"].includes(value);
}

import { prisma } from "@/lib/db";

export function mediaUrl(uploadId: string): string {
  return `/api/media/${encodeURIComponent(uploadId)}`;
}

export type VisibleMediaUpload = {
  pathname: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export function findVisibleMediaUpload(
  viewerId: string,
  id: string,
): Promise<VisibleMediaUpload | null> {
  return prisma.blobUpload.findFirst({
    where: {
      id,
      url: { not: null },
      contentType: { in: ["image/jpeg", "image/png", "image/webp"] },
      OR: [
        {
          ownerId: viewerId,
          lifecycle: { in: ["UPLOADED", "CLAIMED"] },
        },
        {
          lifecycle: "CLAIMED",
          image: {
            savedPlace: {
              OR: [
                { userId: viewerId },
                {
                  user: {
                    requestsSent: {
                      some: {
                        addresseeId: viewerId,
                        status: "ACCEPTED",
                      },
                    },
                  },
                },
                {
                  user: {
                    requestsIn: {
                      some: {
                        requesterId: viewerId,
                        status: "ACCEPTED",
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
    select: { pathname: true, contentType: true },
  }).then((upload) =>
    upload && upload.contentType
      ? {
          pathname: upload.pathname,
          contentType: upload.contentType as VisibleMediaUpload["contentType"],
        }
      : null,
  );
}

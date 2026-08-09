import { prisma } from "@/lib/db";

export function mediaUrl(uploadId: string): string {
  return `/api/media/${encodeURIComponent(uploadId)}`;
}

export type VisibleMediaUpload = {
  pathname: string;
};

export function findVisibleMediaUpload(
  viewerId: string,
  id: string,
): Promise<VisibleMediaUpload | null> {
  return prisma.blobUpload.findFirst({
    where: {
      id,
      url: { not: null },
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
    select: { pathname: true },
  });
}

import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";

loadEnvFile();

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const { prisma } = await import("../src/lib/db");

  try {
    const pending = await prisma.blobUpload.findMany({
      where: {
        lifecycle: {
          in: [
            "PENDING_PRIVATE_COPY",
            "CONVERTING",
            "PENDING_PUBLIC_DELETE",
          ],
        },
      },
      select: {
        id: true,
        lifecycle: true,
        lastError: true,
      },
      take: 20,
    });

    if (pending.length > 0) {
      throw new Error(
        `Blob private conversion incomplete: ${pending
          .map(
            (row) =>
              `${row.id}:${row.lifecycle}${row.lastError ? ":failed" : ""}`,
          )
          .join(", ")}`,
      );
    }

    console.log("Blob private conversion ready: no pending or failed rows");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

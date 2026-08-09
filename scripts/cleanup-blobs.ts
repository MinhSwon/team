import { del } from "@vercel/blob";
import { loadEnvFile } from "node:process";

async function main() {
  loadEnvFile();
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required");

  const [{ cleanupBlobUploads }, { prisma }] = await Promise.all([
    import("../src/lib/blob-uploads"),
    import("../src/lib/db"),
  ]);

  try {
    const result = await cleanupBlobUploads({
      del: (url) => del(url, { token }),
    });
    console.log(`Blob cleanup: ${result.deleted} deleted, ${result.failed} failed`);
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

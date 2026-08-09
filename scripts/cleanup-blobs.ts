import { del, get, put } from "@vercel/blob";
import { loadEnvFile } from "node:process";

async function main() {
  loadEnvFile();
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required");

  const [
    { cleanupBlobUploads, convertLegacyBlobUploads },
    { prisma },
  ] = await Promise.all([
    import("../src/lib/blob-uploads"),
    import("../src/lib/db"),
  ]);

  try {
    const conversion = await convertLegacyBlobUploads({
      get: (url, options) => get(url, options),
      put: (pathname, body, options) =>
        put(pathname, Buffer.from(body), options),
      del: (url, options) => del(url, { token, ...options }),
      token,
      allowedHosts: (process.env.LEGACY_BLOB_STORE_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    });
    const result = await cleanupBlobUploads({
      del: (url, options) => del(url, { token, ...options }),
    });
    console.log(
      `Blob cleanup: ${conversion.converted} converted, ${result.deleted} deleted, ${conversion.failed + result.failed} failed`,
    );
    if (conversion.failed + result.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

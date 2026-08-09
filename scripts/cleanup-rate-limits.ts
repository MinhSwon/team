import { loadEnvFile } from "node:process";

async function main() {
  loadEnvFile();
  const [{ pruneExpiredRateLimitBuckets }, { prisma }] = await Promise.all([
    import("../src/lib/rate-limit"),
    import("../src/lib/db"),
  ]);
  try {
    const deleted = await pruneExpiredRateLimitBuckets();
    console.log(`Rate-limit cleanup: ${deleted} expired buckets deleted`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

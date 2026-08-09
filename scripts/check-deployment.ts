import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";

loadEnvFile();

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  assert.ok(process.env.BETTER_AUTH_URL, "BETTER_AUTH_URL is required");
  assert.ok(
    process.env.BETTER_AUTH_SECRET &&
      process.env.BETTER_AUTH_SECRET.length >= 32,
    "BETTER_AUTH_SECRET must contain at least 32 characters",
  );

  const { trustedProxyList } = await import("../src/lib/rate-limit");
  const proxies = trustedProxyList({
    ...process.env,
    NODE_ENV: "production",
  });
  console.log(
    `Deployment config valid: ${proxies.length} trusted proxy entries. Network deployment must enforce origin isolation or a platform-authenticated client IP proxy chain.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

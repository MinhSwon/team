import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { isAbsolute, join, relative, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

export type FreshProductionServer = {
  appUrl: string;
  buildId: string;
  commit: string;
  pid: number;
  port: number;
};

function runNode(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const clean = (value: unknown) =>
      String(value ?? "")
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
        .replaceAll("\r", "\n");
    throw new Error(
      `${script} ${args.join(" ")} failed: status=${result.status} signal=${result.signal ?? "none"} error=${result.error?.message ?? "none"}\n${clean(result.stdout)}\n${clean(result.stderr)}`,
    );
  }
}

function currentCommit(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `git rev-parse HEAD failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function assertTrackedSourceClean() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  assert.equal(
    result.status,
    0,
    `git status failed\n${result.stdout}\n${result.stderr}`,
  );
  assert.equal(
    result.stdout.trim(),
    "",
    `Acceptance requires clean tracked source\n${result.stdout}`,
  );
}

async function isolatedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForServer(
  child: ChildProcess,
  appUrl: string,
  logs: () => string,
) {
  let spawnError: Error | undefined;
  child.once("error", (error) => {
    spawnError = error;
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) {
      throw new Error(
        `next start exited with ${child.exitCode}\n${logs()}`,
      );
    }
    try {
      const response = await fetch(`${appUrl}/login`, {
        redirect: "manual",
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) return;
    } catch {}
    await delay(250);
  }

  throw new Error(`Timed out waiting for ${appUrl}/login\n${logs()}`);
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    assert.ok(child.pid, "next start PID is unavailable");
    const result = spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(
      result.status,
      0,
      `taskkill failed\n${result.stdout}\n${result.stderr}`,
    );
    return;
  }
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    delay(5000),
  ]);
  if (child.exitCode === null) {
    const killed = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill("SIGKILL");
    await killed;
  }
}

export async function withFreshProductionServer<T>(
  operation: (server: FreshProductionServer) => Promise<T>,
): Promise<T> {
  loadEnvFile();
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  assertTrackedSourceClean();
  const sourceCommit = currentCommit();

  const port = await isolatedPort();
  const appUrl = `http://127.0.0.1:${port}`;
  const previous = {
    APP_URL: process.env.APP_URL,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    TRUSTED_PROXY_IPS: process.env.TRUSTED_PROXY_IPS,
  };
  process.env.APP_URL = appUrl;
  process.env.BETTER_AUTH_URL = appUrl;
  process.env.TRUSTED_PROXY_IPS ||= "127.0.0.1/32";

  const distDir = ".next-acceptance";
  const distPath = resolve(process.cwd(), distDir);
  const relativeDistPath = relative(process.cwd(), distPath);
  assert.ok(
    relativeDistPath &&
      relativeDistPath !== ".." &&
      !relativeDistPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      !isAbsolute(relativeDistPath),
    "Acceptance build directory escaped workspace",
  );
  const env = {
    ...process.env,
    NEXT_ACCEPTANCE_BUILD: "1",
    NEXT_DIST_DIR: distDir,
  };
  const prismaBin = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const tsxBin = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const readinessScript = join(process.cwd(), "scripts", "verify-blob-conversion.ts");
  let child: ChildProcess | undefined;

  try {
    await rm(distPath, { recursive: true, force: true });
    runNode(prismaBin, ["generate"], env);
    runNode(tsxBin, [readinessScript], env);
    runNode(nextBin, ["build"], env);
    assert.equal(currentCommit(), sourceCommit, "Source commit changed during build");

    const buildId = readFileSync(
      join(distPath, "BUILD_ID"),
      "utf8",
    ).trim();
    const commit = sourceCommit;
    let stdout = "";
    let stderr = "";
    child = spawn(
      process.execPath,
      [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
      {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    await waitForServer(child, appUrl, () => `${stdout}\n${stderr}`);
    assert.ok(child.pid, "next start PID is unavailable");
    console.log(
      `Fresh production server: build ${buildId}, commit ${commit}, pid ${child.pid}, port ${port}`,
    );
    return await operation({
      appUrl,
      buildId,
      commit,
      pid: child.pid,
      port,
    });
  } finally {
    if (child) await stopServer(child);
    await rm(distPath, { recursive: true, force: true });
    assert.equal(
      currentCommit(),
      sourceCommit,
      "Source commit changed during acceptance",
    );
    assertTrackedSourceClean();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

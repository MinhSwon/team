import assert from "node:assert/strict";

import type { AcceptanceClient } from "./acceptance-support";
import { withFreshProductionServer } from "./acceptance-server";

class CookieClient implements AcceptanceClient {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly appUrl: string,
    private readonly ip: string,
  ) {}

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Origin", this.appUrl);
    headers.set("x-forwarded-for", this.ip);
    if (this.cookies.size > 0) {
      headers.set(
        "Cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }

    const response = await fetch(`${this.appUrl}${path}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const body =
      response.status === 204
        ? null
        : await response.json().catch(() => null);
    return { status: response.status, body };
  }
}

async function login(client: CookieClient, email: string, password: string) {
  const response = await client.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(
    response.status,
    200,
    `sign-in failed for ${email}: ${JSON.stringify(response.body)}`,
  );
}

async function runSocialAcceptance(appUrl: string) {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const {
    createAcceptanceIp,
    demoUsers,
    runAcceptance,
    seedDemoUsers,
  } = await import(
    "./acceptance-support"
  );
  seedDemoUsers();
  const { prisma } = await import("../src/lib/db");
  const acceptanceIp = createAcceptanceIp();
  const clients = {
    alice: new CookieClient(appUrl, acceptanceIp),
    bob: new CookieClient(appUrl, acceptanceIp),
    carol: new CookieClient(appUrl, acceptanceIp),
  };

  try {
    await Promise.all(
      demoUsers.map((user, index) =>
        login(
          clients[["alice", "bob", "carol"][index] as keyof typeof clients],
          user.email,
          user.password,
        ),
      ),
    );
    console.log(`Application: ${appUrl}`);
    await runAcceptance(prisma, clients);
  } finally {
    await prisma.$disconnect();
  }
}

withFreshProductionServer(({ appUrl }) => runSocialAcceptance(appUrl)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

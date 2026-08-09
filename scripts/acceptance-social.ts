import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
  const signupId = randomUUID().replaceAll("-", "");
  const signupEmail = `auth-sanitize-${signupId}@example.com`;

  try {
    const signupClient = new CookieClient(appUrl, acceptanceIp);
    const signup = await signupClient.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "  Direct Auth User  ",
          email: signupEmail,
          password: "acceptance-password",
          username: `auth.${signupId.slice(0, 20)}`,
          image: "https://images.example/direct-auth.png",
        }),
      },
    );
    assert.equal(
      signup.status,
      200,
      `direct sign-up failed: ${JSON.stringify(signup.body)}`,
    );
    assert.deepEqual(
      await prisma.user.findUnique({
        where: { email: signupEmail },
        select: { name: true, image: true },
      }),
      { name: "Direct Auth User", image: null },
    );
    console.log("Direct auth signup sanitation: PASS");

    for (const body of [
      { image: "https://images.example/update-user.png" },
      { name: "   " },
      { name: "n".repeat(81) },
      { username: "bad username" },
    ]) {
      const rejected = await signupClient.request("/api/auth/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(
        rejected.status,
        400,
        `invalid auth update persisted: ${JSON.stringify(body)} ${JSON.stringify(rejected.body)}`,
      );
    }
    const updatedUsername = `auth.updated.${signupId.slice(0, 12)}`;
    const updated = await signupClient.request("/api/auth/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Updated Auth User  ",
        username: `  ${updatedUsername.toUpperCase()}  `,
      }),
    });
    assert.equal(
      updated.status,
      200,
      `valid auth update failed: ${JSON.stringify(updated.body)}`,
    );
    assert.deepEqual(
      await prisma.user.findUnique({
        where: { email: signupEmail },
        select: { name: true, username: true, image: true },
      }),
      {
        name: "Updated Auth User",
        username: updatedUsername,
        image: null,
      },
    );
    console.log("Direct auth update sanitation: PASS");

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
    try {
      await prisma.user.deleteMany({ where: { email: signupEmail } });
    } finally {
      await prisma.$disconnect();
    }
  }
}

withFreshProductionServer(({ appUrl }) => runSocialAcceptance(appUrl)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

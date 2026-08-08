import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";

const demoUsers = [
  {
    name: "Demo Alice",
    email: "alice@placedecide.local",
    username: "demo.alice",
    password: "DemoAlice!2026",
  },
  {
    name: "Demo Bob",
    email: "bob@placedecide.local",
    username: "demo.bob",
    password: "DemoBob!2026",
  },
] as const;

async function main() {
  loadEnvFile();
  const [{ auth }, { prisma }, { friendPairKey }] = await Promise.all([
    import("../src/lib/auth"),
    import("../src/lib/db"),
    import("../src/lib/friendships"),
  ]);

  try {
    async function ensureUser(input: (typeof demoUsers)[number]) {
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email: input.email }, { username: input.username }],
        },
      });

      if (existing) {
        assert.equal(
          existing.email,
          input.email,
          `${input.username} email conflict`,
        );
        assert.equal(
          existing.username,
          input.username,
          `${input.email} username conflict`,
        );
        return existing;
      }

      const result = await auth.api.signUpEmail({ body: input });
      return result.user;
    }

    const alice = await ensureUser(demoUsers[0]);
    const bob = await ensureUser(demoUsers[1]);
    const pairKey = friendPairKey(alice.id, bob.id);
    const friendship = await prisma.friendship.upsert({
      where: { pairKey },
      update: {
        requesterId: alice.id,
        addresseeId: bob.id,
        status: "ACCEPTED",
      },
      create: {
        requesterId: alice.id,
        addresseeId: bob.id,
        pairKey,
        status: "ACCEPTED",
      },
    });
    const credentialAccounts = await prisma.account.count({
      where: {
        userId: { in: [alice.id, bob.id] },
        providerId: "credential",
      },
    });

    assert.equal(
      credentialAccounts,
      2,
      "Better Auth credential accounts missing",
    );
    assert.equal(friendship.status, "ACCEPTED");

    console.table(
      demoUsers.map((user, index) => ({
        id: index === 0 ? alice.id : bob.id,
        email: user.email,
        username: user.username,
        password: user.password,
      })),
    );
    console.log(`Accepted friendship: ${friendship.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

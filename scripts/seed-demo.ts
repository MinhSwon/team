import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production");
  }
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Set ALLOW_DEMO_SEED=1 to run demo seed");
  }

  loadEnvFile();
  const [
    { auth },
    { prisma },
    { demoUsers, demoUserSelector },
    { friendPairKey },
  ] = await Promise.all([
    import("../src/lib/auth"),
    import("../src/lib/db"),
    import("../src/lib/demo-users"),
    import("../src/lib/friendships"),
  ]);

  try {
    await prisma.user.deleteMany({ where: demoUserSelector });

    const users: { id: string }[] = [];
    for (const input of demoUsers) {
      const result = await auth.api.signUpEmail({ body: input });
      users.push(result.user);
    }

    const [alice, bob] = users;
    const pairKey = friendPairKey(alice.id, bob.id);
    const friendship = await prisma.friendship.create({
      data: {
        requesterId: alice.id,
        addresseeId: bob.id,
        pairKey,
        status: "ACCEPTED",
      },
    });
    const credentialAccounts = await prisma.account.count({
      where: {
        userId: { in: users.map(({ id }) => id) },
        providerId: "credential",
      },
    });

    assert.equal(
      credentialAccounts,
      demoUsers.length,
      "Better Auth credential accounts missing",
    );
    assert.equal(friendship.status, "ACCEPTED");

    for (const [index, credentials] of demoUsers.entries()) {
      const signedIn = await auth.api.signInEmail({
        body: {
          email: credentials.email,
          password: credentials.password,
        },
      });
      assert.equal(
        signedIn.user.id,
        users[index].id,
        `${credentials.email} sign-in returned wrong user`,
      );
    }

    console.table(
      demoUsers.map((user, index) => ({
        id: users[index].id,
        email: user.email,
        username: user.username,
        password: user.password,
      })),
    );
    console.log(`Accepted friendship: ${friendship.id}`);
    console.log(`Verified credential sign-ins: ${demoUsers.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

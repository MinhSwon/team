import type { Prisma } from "@prisma/client";

export const demoUsers = [
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
  {
    name: "Demo Carol",
    email: "carol@placedecide.local",
    username: "demo.carol",
    password: "DemoCarol!2026",
  },
] as const;

export const demoUserSelector = {
  OR: [
    { email: { in: demoUsers.map(({ email }) => email) } },
    { username: { in: demoUsers.map(({ username }) => username) } },
  ],
} satisfies Prisma.UserWhereInput;

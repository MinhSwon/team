import type { PrismaClient } from "@prisma/client";
import type { Browser, BrowserContext } from "playwright-core";

export async function closeBrowserResources({
  contexts,
  browser,
  prisma,
  freshEmail,
}: {
  contexts: Array<Pick<BrowserContext, "close">>;
  browser?: Pick<Browser, "close">;
  prisma?: Pick<PrismaClient, "$disconnect" | "user">;
  freshEmail?: string;
}) {
  const failures: unknown[] = [];
  const contextResults = await Promise.allSettled(
    contexts.map((context) => Promise.resolve().then(() => context.close())),
  );
  failures.push(
    ...contextResults
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason),
  );

  const finalResults = await Promise.allSettled([
    Promise.resolve().then(() => browser?.close()),
    prisma
      ? (async () => {
          try {
            if (freshEmail) {
              await prisma.user.deleteMany({
                where: { email: freshEmail },
              });
            }
          } finally {
            await prisma.$disconnect();
          }
        })()
      : undefined,
  ]);
  failures.push(
    ...finalResults
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason),
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Browser acceptance cleanup failed");
  }
}

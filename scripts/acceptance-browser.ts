import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { chromium, type Page } from "playwright-core";

loadEnvFile();

const appUrl = (
  process.env.APP_URL ??
  process.env.BETTER_AUTH_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");

function browserPath(): string {
  const local = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    local
      ? `${local}\\Google\\Chrome\\Application\\chrome.exe`
      : undefined,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    local
      ? `${local}\\Microsoft\\Edge\\Application\\msedge.exe`
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find(existsSync);
  assert.ok(
    found,
    "No Chrome or Edge executable found; set CHROME_PATH",
  );
  return found;
}

async function pageRequest(
  page: Page,
  path: string,
  init: {
    method?: string;
    body?: unknown;
  } = {},
) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers:
          body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        body:
          response.status === 204
            ? null
            : await response.json().catch(() => null),
      };
    },
    { path, method: init.method, body: init.body },
  );
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${appUrl}/feed`);
}

async function waitUntil(
  operation: () => Promise<boolean>,
  label: string,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await operation()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const {
    demoUsers,
    prepareAcceptanceDatabase,
    seedDemoUsers,
  } = await import("./acceptance-support");
  seedDemoUsers();
  const { prisma } = await import("../src/lib/db");
  const users = await prepareAcceptanceDatabase(prisma);
  const browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  const contexts = await Promise.all(
    demoUsers.map(() => browser.newContext({ baseURL: appUrl })),
  );
  const [alice, bob, carol] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const results: Array<{ name: string; error?: string }> = [];
  let friendshipId: string | undefined;
  let manualSavedId: string | undefined;
  let manualPlaceId: string | undefined;
  let manualPostId: string | undefined;
  let bobSavedId: string | undefined;
  let bobPostId: string | undefined;

  async function criterion(
    index: number,
    name: string,
    operation: () => Promise<void>,
  ) {
    try {
      await operation();
      results.push({ name });
      console.log(`PASS ${index}/12 ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, error: message });
      console.error(`FAIL ${index}/12 ${name}: ${message}`);
    }
  }

  try {
    await criterion(1, "demo users sign in through UI", async () => {
      await Promise.all(
        demoUsers.map((user, index) =>
          login([alice, bob, carol][index], user.email, user.password),
        ),
      );
      for (const [page, user] of [
        [alice, users.alice],
        [bob, users.bob],
        [carol, users.carol],
      ] as const) {
        const session = await pageRequest(page, "/api/auth/get-session");
        assert.equal(session.status, 200);
        assert.equal(
          (session.body as { user: { id: string } }).user.id,
          user.id,
        );
      }
    });

    await criterion(2, "friend request is sent and accepted through UI", async () => {
      await alice.goto(`${appUrl}/friends`);
      await alice.getByLabel("Search people").fill("demo.bob");
      await alice.getByRole("button", { name: "Search", exact: true }).click();
      await alice
        .getByRole("button", { name: "Send friend request to Demo Bob" })
        .click();
      await alice.getByText("Pending", { exact: true }).waitFor();

      await bob.goto(`${appUrl}/friends`);
      const [accepted] = await Promise.all([
        bob.waitForResponse(
          (response) =>
            response.url().includes("/api/friends/") &&
            response.request().method() === "PATCH",
        ),
        bob
          .getByRole("button", { name: "Accept Demo Alice" })
          .click(),
      ]);
      assert.equal(accepted.status(), 200);
      await waitUntil(
        async () =>
          (
            await prisma.friendship.findUnique({
              where: {
                pairKey: [users.alice.id, users.bob.id].sort().join(":"),
              },
              select: { status: true },
            })
          )?.status === "ACCEPTED",
        "accepted friendship",
      );
      const friendship = await prisma.friendship.findUnique({
        where: {
          pairKey: [users.alice.id, users.bob.id].sort().join(":"),
        },
      });
      assert.equal(friendship?.status, "ACCEPTED");
      friendshipId = friendship.id;
    });

    await criterion(3, "manual UI save creates exactly one post", async () => {
      await alice.goto(`${appUrl}/add`);
      await alice.getByRole("tab", { name: "Manual" }).click();
      await alice.locator("#manual-name").fill("Acceptance Manual Cafe");
      await alice.locator("#manual-address").fill("1 Acceptance Way");
      await alice.getByRole("button", { name: "Confirm place" }).click();
      await alice.getByRole("heading", { name: "Confirm details" }).waitFor();
      await alice.getByRole("button", { name: "Save and share" }).click();
      await alice.waitForURL(/\/places\//);

      const saved = await prisma.userSavedPlace.findFirst({
        where: {
          userId: users.alice.id,
          place: { name: "Acceptance Manual Cafe" },
        },
        include: { post: true, place: true },
      });
      assert.ok(saved?.post);
      manualSavedId = saved.id;
      manualPlaceId = saved.placeId;
      manualPostId = saved.post.id;
      assert.equal(
        await prisma.post.count({ where: { savedPlaceId: saved.id } }),
        1,
      );
    });

    await criterion(4, "search and Maps-link UI paths save places", async () => {
      await alice.goto(`${appUrl}/add`);
      await alice
        .locator("#place-search")
        .fill("Acceptance Harness Search");
      await alice.getByRole("button", { name: "Search places" }).click();
      await alice.getByRole("button", {
        name: /Acceptance Harness Search Bistro/,
      }).click();
      await alice.getByRole("button", { name: "Save and share" }).click();
      await alice.waitForURL(/\/places\//);

      await alice.goto(`${appUrl}/add`);
      await alice.getByRole("tab", { name: "Maps Link" }).click();
      await alice
        .locator("#maps-link")
        .fill("https://www.google.com/maps/place/Acceptance+Maps+Cafe");
      await alice.getByRole("button", { name: "Resolve link" }).click();
      await alice.getByRole("heading", { name: "Confirm details" }).waitFor();
      assert.equal(
        await alice.locator("#confirmed-name").inputValue(),
        "Acceptance Maps Cafe",
      );
      await alice.locator("#confirmed-address").fill("3 Acceptance Way");
      await alice.getByRole("button", { name: "Save and share" }).click();
      await alice.waitForURL(/\/places\//);

      for (const name of [
        "Acceptance Harness Search Bistro",
        "Acceptance Maps Cafe",
      ]) {
        const saved = await prisma.userSavedPlace.findFirst({
          where: { userId: users.alice.id, place: { name } },
          include: { post: true, images: true },
        });
        assert.ok(saved?.post, `${name} post missing`);
        assert.equal(saved.images.length, 0, `${name} must use no-image path`);
      }
    });

    await criterion(5, "accepted friend sees all posts in UI feed", async () => {
      await bob.goto(`${appUrl}/feed`);
      for (const name of [
        "Acceptance Manual Cafe",
        "Acceptance Harness Search Bistro",
        "Acceptance Maps Cafe",
      ]) {
        await bob
          .locator("article")
          .filter({ hasText: name })
          .waitFor();
      }
    });

    await criterion(6, "nonfriend post GET is opaque 404 in page context", async () => {
      assert.ok(manualPostId);
      const response = await pageRequest(carol, `/api/posts/${manualPostId}`);
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { error: "Post not found" });
    });

    await criterion(7, "friend likes, comments, and resaves through UI", async () => {
      assert.ok(manualPostId);
      await bob.goto(`${appUrl}/feed`);
      const post = bob
        .locator("article")
        .filter({ hasText: "Acceptance Manual Cafe" });
      await post.getByRole("button", { name: "Like" }).click();
      await post.getByRole("button", { name: "Unlike" }).waitFor();
      await post.getByRole("button", { name: "Add comment" }).click();
      await post
        .getByRole("textbox", { name: "Comment" })
        .fill("Acceptance browser comment");
      await post.getByRole("button", { name: "Post" }).click();
      await post.getByText("Acceptance browser comment").waitFor();
      await post.getByRole("button", { name: "Save place" }).click();
      await post.getByText("Saved", { exact: true }).waitFor();

      const saved = await prisma.userSavedPlace.findFirst({
        where: {
          userId: users.bob.id,
          placeId: manualPlaceId,
        },
        include: { post: true },
      });
      assert.ok(saved?.post);
      bobSavedId = saved.id;
      bobPostId = saved.post.id;
      assert.equal(
        await prisma.postLike.count({
          where: { postId: manualPostId, userId: users.bob.id },
        }),
        1,
      );
      assert.equal(
        await prisma.comment.count({
          where: {
            postId: manualPostId,
            authorId: users.bob.id,
            deletedAt: null,
          },
        }),
        1,
      );
    });

    await criterion(8, "duplicate page-context save keeps attribution", async () => {
      assert.ok(manualPostId && manualPlaceId && bobSavedId && bobPostId);
      const duplicate = await pageRequest(
        bob,
        `/api/posts/${manualPostId}/save`,
        { method: "POST" },
      );
      assert.equal(duplicate.status, 200);
      const body = duplicate.body as {
        savedPlace: { id: string };
        post: { id: string };
      };
      assert.equal(body.savedPlace.id, bobSavedId);
      assert.equal(body.post.id, bobPostId);
      const saved = await prisma.userSavedPlace.findUnique({
        where: { id: bobSavedId },
        include: { post: true },
      });
      assert.equal(saved?.sourcePostId, manualPostId);
      assert.equal(saved?.post?.sourcePostId, manualPostId);
      assert.equal(
        await prisma.userSavedPlace.count({
          where: { userId: users.bob.id, placeId: manualPlaceId },
        }),
        1,
      );
    });

    await criterion(9, "review page-context update renders in existing post", async () => {
      assert.ok(manualSavedId);
      const updated = await pageRequest(
        alice,
        `/api/saved/${manualSavedId}`,
        {
          method: "PATCH",
          body: {
            rating: 5,
            review: "Updated acceptance review",
          },
        },
      );
      assert.equal(updated.status, 200);
      await bob.goto(`${appUrl}/feed`);
      const post = bob
        .locator("article")
        .filter({ hasText: "Acceptance Manual Cafe" });
      await post.getByText("Updated acceptance review").waitFor();
      await post.getByText("5/5").waitFor();
      assert.equal(
        await prisma.post.count({ where: { savedPlaceId: manualSavedId } }),
        1,
      );
    });

    await criterion(10, "notifications render and become read through UI", async () => {
      await alice.goto(`${appUrl}/notifications`);
      await alice.getByText("accepted your friend request").waitFor();
      await alice.getByText(/liked Acceptance Manual Cafe/).waitFor();
      await alice.getByText(/commented on Acceptance Manual Cafe/).waitFor();
      await alice
        .getByRole("button", { name: "Mark all notifications read" })
        .click();
      await waitUntil(
        async () =>
          (await prisma.notification.count({
            where: { recipientId: users.alice.id, readAt: null },
          })) === 0,
        "notification read state",
      );
      await alice.reload();
      assert.equal(
        await alice
          .getByRole("button", { name: "Mark all notifications read" })
          .count(),
        0,
      );
    });

    await criterion(11, "friend removal hides feed, profiles, and post", async () => {
      assert.ok(friendshipId && manualPostId);
      await bob.goto(`${appUrl}/friends`);
      const [removed] = await Promise.all([
        bob.waitForResponse(
          (response) =>
            response.url().includes("/api/friends/") &&
            response.request().method() === "DELETE",
        ),
        bob
          .getByRole("button", { name: "Remove Demo Alice" })
          .click(),
      ]);
      assert.equal(removed.status(), 204);
      await waitUntil(
        async () =>
          (await prisma.friendship.count({
            where: { id: friendshipId },
          })) === 0,
        "friendship removal",
      );

      await bob.goto(`${appUrl}/feed`);
      assert.equal(
        await bob
          .locator('article header a[href="/profile/demo.alice"]')
          .count(),
        0,
      );
      assert.equal(
        (await bob.goto(`${appUrl}/profile/demo.alice`))?.status(),
        404,
      );
      assert.equal(
        (await alice.goto(`${appUrl}/profile/demo.bob`))?.status(),
        404,
      );
      const post = await pageRequest(
        bob,
        `/api/posts/${manualPostId}`,
      );
      assert.equal(post.status, 404);
      assert.deepEqual(post.body, { error: "Post not found" });
    });

    await criterion(12, "browser reload preserves saved data", async () => {
      assert.ok(manualSavedId && manualPostId);
      await alice.goto(`${appUrl}/feed`);
      await alice
        .locator("article")
        .filter({ hasText: "Updated acceptance review" })
        .waitFor();
      await alice.reload();
      await alice
        .locator("article")
        .filter({ hasText: "Updated acceptance review" })
        .waitFor();
      const persisted = await prisma.userSavedPlace.findUnique({
        where: { id: manualSavedId },
        include: { post: true },
      });
      assert.equal(persisted?.rating, 5);
      assert.equal(persisted?.review, "Updated acceptance review");
      assert.equal(persisted?.post?.id, manualPostId);
    });

    const failures = results.filter(({ error }) => error);
    console.log(`Browser: ${browserPath()}`);
    console.log(`Application: ${appUrl}`);
    console.log(
      `Acceptance total: ${results.length - failures.length} PASS, ${failures.length} FAIL`,
    );
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

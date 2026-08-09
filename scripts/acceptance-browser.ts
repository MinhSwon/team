import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import type { Locator, Page } from "playwright-core";

import { withFreshProductionServer } from "./acceptance-server";

const criterionTotal = 14;

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

async function login(
  page: Page,
  appUrl: string,
  email: string,
  password: string,
) {
  await page.goto(`${appUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await responsePromise;
  assert.equal(
    response.status(),
    200,
    `sign-in failed for ${email}: ${await response.text()}`,
  );
  await waitUntil(
    async () => new URL(page.url()).pathname === "/feed",
    `${email} sign-in redirect`,
  );
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

async function tabTo(page: Page, target: Locator, label: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }
  assert.fail(`Keyboard could not reach ${label}`);
}

async function assertLayout(page: Page, mobile: boolean) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const metrics = await page.evaluate(() => {
    const mobileNav = document.querySelector<HTMLElement>(
      'nav[aria-label="Mobile navigation"]',
    );
    const main = document.querySelector<HTMLElement>("main");
    const last = main?.lastElementChild as HTMLElement | null;
    const navLabels = mobileNav
      ? [...mobileNav.querySelectorAll<HTMLElement>("span")]
      : [];
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      lastBottom: last?.getBoundingClientRect().bottom ?? 0,
      navTop: mobileNav?.getBoundingClientRect().top ?? window.innerHeight,
      labelsFit: navLabels.every(
        (label) => label.scrollWidth <= label.clientWidth + 1,
      ),
    };
  });
  assert.ok(
    metrics.scrollWidth <= metrics.viewportWidth + 1,
    `horizontal overflow: ${metrics.scrollWidth} > ${metrics.viewportWidth}`,
  );
  if (mobile) {
    assert.ok(
      metrics.lastBottom <= metrics.navTop + 1,
      `bottom nav obscures content: ${metrics.lastBottom} > ${metrics.navTop}`,
    );
    assert.equal(metrics.labelsFit, true, "mobile navigation labels must wrap");
  }
}

async function runBrowserAcceptance(appUrl: string) {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const {
    createAcceptanceIp,
    demoUsers,
    prepareAcceptanceDatabase,
    seedDemoUsers,
  } = await import("./acceptance-support");
  seedDemoUsers();
  const { prisma } = await import("../src/lib/db");
  const { chromium } = await import("playwright-core");
  const users = await prepareAcceptanceDatabase(prisma);
  const browser = await chromium.launch({
    executablePath: browserPath(),
    headless: true,
  });
  const acceptanceIp = createAcceptanceIp();
  const contexts = await Promise.all(
    [...demoUsers, null].map(() =>
      browser.newContext({
        baseURL: appUrl,
        extraHTTPHeaders: { "x-forwarded-for": acceptanceIp },
      }),
    ),
  );
  const [alice, bob, carol, fresh] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const results: Array<{ name: string; error?: string }> = [];
  let friendshipId: string | undefined;
  let manualSavedId: string | undefined;
  let manualPlaceId: string | undefined;
  let manualPostId: string | undefined;
  let bobSavedId: string | undefined;
  let bobPostId: string | undefined;
  let searchPlaceId: string | undefined;
  const freshSuffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const freshEmail = `acceptance-${freshSuffix}@example.com`;

  async function criterion(
    index: number,
    name: string,
    operation: () => Promise<void>,
  ) {
    try {
      await operation();
      results.push({ name });
      console.log(`PASS ${index}/${criterionTotal} ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name, error: message });
      console.error(`FAIL ${index}/${criterionTotal} ${name}: ${message}`);
    }
  }

  try {
    await criterion(1, "fresh registration and demo users sign in through UI", async () => {
      await fresh.goto(`${appUrl}/register`);
      await fresh
        .getByLabel("Name", { exact: true })
        .fill("Acceptance Fresh User");
      await fresh
        .getByLabel("Username", { exact: true })
        .fill(`acceptance.${freshSuffix}`);
      await fresh.getByLabel("Email", { exact: true }).fill(freshEmail);
      await fresh
        .getByLabel("Password", { exact: true })
        .fill("AcceptanceFresh!123");
      const registrationPromise = fresh.waitForResponse((response) =>
        response.url().includes("/api/auth/sign-up/email"),
      );
      await fresh.getByRole("button", { name: "Create account" }).click();
      const registration = await registrationPromise;
      assert.equal(
        registration.status(),
        200,
        `fresh registration failed: ${await registration.text()}`,
      );
      await waitUntil(
        async () => new URL(fresh.url()).pathname === "/feed",
        "fresh registration redirect",
      );
      const freshUser = await prisma.user.findUnique({
        where: { email: freshEmail },
        select: { id: true },
      });
      assert.ok(freshUser, "fresh UI registration must persist user");

      await Promise.all(
        demoUsers.map((user, index) =>
          login(
            [alice, bob, carol][index],
            appUrl,
            user.email,
            user.password,
          ),
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
      await alice.getByRole("button", { name: "Manual", exact: true }).click();
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
      searchPlaceId = (
        await prisma.place.findUnique({
          where: {
            externalSource_externalPlaceId: {
              externalSource: "acceptance",
              externalPlaceId: "search-bistro",
            },
          },
          select: { id: true },
        })
      )?.id;
      assert.ok(searchPlaceId);

      await alice.goto(`${appUrl}/add`);
      await alice
        .getByRole("button", { name: "Maps Link", exact: true })
        .click();
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

      assert.ok(manualPlaceId);
      await bob.goto(`${appUrl}/add`);
      await bob.locator("#place-search").fill("Acceptance Manual Cafe");
      await bob.getByRole("button", { name: "Search places" }).click();
      await bob
        .getByRole("button", { name: /Acceptance Manual Cafe/ })
        .waitFor();
      assert.equal(
        (await bob.goto(`${appUrl}/places/${manualPlaceId}`))?.status(),
        200,
      );
    });

    await criterion(6, "manual privacy and unauthorized APIs are opaque", async () => {
      assert.ok(manualPostId && manualPlaceId && manualSavedId);

      for (const state of ["stranger", "pending"] as const) {
        await carol.goto(`${appUrl}/add`);
        await carol.locator("#place-search").fill("Acceptance Manual Cafe");
        await carol.getByRole("button", { name: "Search places" }).click();
        await carol.getByText("No matches found. Try Manual.").waitFor();
        assert.equal(
          (await carol.goto(`${appUrl}/places/${manualPlaceId}`))?.status(),
          404,
          state,
        );

        if (state === "stranger") {
          await alice.goto(`${appUrl}/friends`);
          await alice.getByLabel("Search people").fill("demo.carol");
          await alice
            .getByRole("button", { name: "Search", exact: true })
            .click();
          await alice
            .getByRole("button", {
              name: "Send friend request to Demo Carol",
            })
            .click();
          await alice.getByText("Pending", { exact: true }).waitFor();
        }
      }

      const post = await pageRequest(carol, `/api/posts/${manualPostId}`);
      assert.equal(post.status, 404);
      assert.deepEqual(post.body, { error: "Post not found" });

      const patch = await pageRequest(carol, `/api/saved/${manualSavedId}`, {
        method: "PATCH",
        body: { status: "VISITED" },
      });
      const remove = await pageRequest(carol, `/api/saved/${manualSavedId}`, {
        method: "DELETE",
      });
      for (const response of [patch, remove]) {
        assert.equal(response.status, 404);
        assert.deepEqual(response.body, {
          error: "Saved place not found",
        });
      }
    });

    await criterion(7, "friend likes, comments, and resaves through UI", async () => {
      assert.ok(manualPostId);
      await bob.goto(`${appUrl}/feed`);
      const post = bob
        .locator("article")
        .filter({ hasText: "Acceptance Manual Cafe" })
        .filter({
          has: bob.locator('header a[href="/profile/demo.alice"]'),
        });
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

    await criterion(8, "reshare attribution and duplicate UI state are stable", async () => {
      assert.ok(manualPostId && manualPlaceId && bobSavedId && bobPostId);
      await bob.goto(`${appUrl}/feed`);
      const post = bob
        .locator("article")
        .filter({ hasText: "Acceptance Manual Cafe" })
        .filter({
          has: bob.locator('header a[href="/profile/demo.alice"]'),
        });
      const savedButton = post.getByRole("button", { name: "Save place" });
      await savedButton.waitFor();
      assert.equal(await savedButton.isDisabled(), true);
      await bob.reload();
      assert.equal(
        await bob
          .locator("article")
          .filter({ hasText: "Acceptance Manual Cafe" })
          .filter({
            has: bob.locator('header a[href="/profile/demo.alice"]'),
          })
          .getByRole("button", { name: "Save place" })
          .isDisabled(),
        true,
      );
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

    await criterion(9, "saved search filter edit and remove use visible UI", async () => {
      assert.ok(manualSavedId && searchPlaceId);
      await alice.goto(`${appUrl}/saved`);
      const savedSearch = alice.getByLabel("Search saved places");
      await savedSearch.fill("Acceptance Manual Cafe");
      const manualRow = alice
        .locator("li")
        .filter({ hasText: "Acceptance Manual Cafe" });
      await manualRow.getByRole("link", { name: "Edit" }).click();
      await alice.waitForURL(new RegExp(`/places/${manualPlaceId}`));
      await alice.getByRole("button", { name: "5 stars" }).click();
      await alice.getByLabel("Review").fill("Updated acceptance review");
      await alice.locator("#saved-status").selectOption("VISITED");
      const [updated] = await Promise.all([
        alice.waitForResponse(
          (response) =>
            response.url().includes(`/api/saved/${manualSavedId}`) &&
            response.request().method() === "PATCH",
        ),
        alice.getByRole("button", { name: "Update save" }).click(),
      ]);
      assert.equal(updated.status(), 200);

      await alice.goto(`${appUrl}/saved`);
      await alice.getByLabel("Search saved places").fill("Acceptance Manual");
      await alice.getByLabel("Status filter").selectOption("VISITED");
      await alice
        .locator("li")
        .filter({ hasText: "Acceptance Manual Cafe" })
        .waitFor();

      await alice.getByLabel("Status filter").selectOption("ALL");
      await alice
        .getByLabel("Search saved places")
        .fill("Acceptance Harness Search");
      const searchRow = alice
        .locator("li")
        .filter({ hasText: "Acceptance Harness Search Bistro" });
      await searchRow.waitFor();
      alice.once("dialog", (dialog) => dialog.accept());
      await searchRow.getByRole("button", { name: "Remove" }).click();
      await waitUntil(
        async () => (await searchRow.count()) === 0,
        "saved-place removal",
      );

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
      assert.equal(
        await prisma.userSavedPlace.count({
          where: {
            userId: users.alice.id,
            placeId: searchPlaceId,
          },
        }),
        0,
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
      assert.ok(friendshipId && manualPostId && manualPlaceId);
      await bob.goto(`${appUrl}/saved`);
      await bob
        .getByLabel("Search saved places")
        .fill("Acceptance Manual Cafe");
      const bobManualRow = bob
        .locator("li")
        .filter({ hasText: "Acceptance Manual Cafe" });
      await bobManualRow.waitFor();
      bob.once("dialog", (dialog) => dialog.accept());
      await bobManualRow.getByRole("button", { name: "Remove" }).click();
      await waitUntil(
        async () => (await bobManualRow.count()) === 0,
        "Bob manual save removal",
      );

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

      await bob.goto(`${appUrl}/add`);
      await bob.locator("#place-search").fill("Acceptance Manual Cafe");
      await bob.getByRole("button", { name: "Search places" }).click();
      await bob.getByText("No matches found. Try Manual.").waitFor();
      assert.equal(
        (await bob.goto(`${appUrl}/places/${manualPlaceId}`))?.status(),
        404,
      );
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
      assert.equal(persisted?.status, "VISITED");
      assert.equal(persisted?.post?.id, manualPostId);
    });

    await criterion(13, "unsaved detail saves and removes canonical place in UI", async () => {
      assert.ok(searchPlaceId);
      assert.equal(
        (await carol.goto(`${appUrl}/places/${searchPlaceId}`))?.status(),
        200,
      );
      const [saved] = await Promise.all([
        carol.waitForResponse(
          (response) =>
            response.url().endsWith("/api/saved") &&
            response.request().method() === "POST",
        ),
        carol.getByRole("button", { name: "Save place" }).click(),
      ]);
      assert.equal(saved.status(), 200);
      assert.equal(carol.url(), `${appUrl}/places/${searchPlaceId}`);
      await carol.getByRole("button", { name: "Update save" }).waitFor();
      assert.equal(
        await prisma.userSavedPlace.count({
          where: { userId: users.carol.id, placeId: searchPlaceId },
        }),
        1,
      );

      carol.once("dialog", (dialog) => dialog.accept());
      const [removed] = await Promise.all([
        carol.waitForResponse(
          (response) =>
            response.url().includes("/api/saved/") &&
            response.request().method() === "DELETE",
        ),
        carol.getByRole("button", { name: "Remove save" }).click(),
      ]);
      assert.equal(removed.status(), 204);
      await carol.getByRole("button", { name: "Save place" }).waitFor();
      assert.equal(
        await prisma.userSavedPlace.count({
          where: { userId: users.carol.id, placeId: searchPlaceId },
        }),
        0,
      );
    });

    await criterion(14, "desktop and 375px mobile layout and keyboard controls pass", async () => {
      await alice.setViewportSize({ width: 1280, height: 800 });
      await alice.goto(`${appUrl}/saved`);
      await assertLayout(alice, false);

      await alice.setViewportSize({ width: 375, height: 812 });
      assert.ok(manualPlaceId);
      for (const route of [
        "/feed",
        "/friends",
        "/notifications",
        "/profile/demo.alice",
        `/places/${manualPlaceId}`,
        "/saved",
        "/add",
      ]) {
        await alice.goto(`${appUrl}${route}`);
        await assertLayout(alice, true);
      }

      const addLink = alice
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "Add" });
      await tabTo(alice, addLink, "mobile Add navigation");
      await alice.keyboard.press("Enter");
      await alice.waitForURL(`${appUrl}/add`);

      const manualButton = alice.getByRole("button", {
        name: "Manual",
        exact: true,
      });
      await tabTo(alice, manualButton, "Manual segmented button");
      await alice.keyboard.press("Space");
      await alice.locator("#manual-name").fill("Keyboard Acceptance Place");
      await alice.locator("#manual-address").fill("14 Keyboard Way");
      const confirmButton = alice.getByRole("button", {
        name: "Confirm place",
      });
      await tabTo(alice, confirmButton, "Confirm place button");
      await alice.keyboard.press("Enter");
      await alice.getByRole("heading", { name: "Confirm details" }).waitFor();
      await assertLayout(alice, true);
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
    await prisma.user.deleteMany({ where: { email: freshEmail } });
    await prisma.$disconnect();
  }
}

withFreshProductionServer(({ appUrl }) => runBrowserAcceptance(appUrl)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

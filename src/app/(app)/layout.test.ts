import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type { User } from "@prisma/client";
import ts from "typescript";

import { protectAppRoute } from "./layout";

const user: User = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  emailVerified: true,
  image: null,
  username: "alice",
  bio: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("protected app routes invoke server identity", async () => {
  let calls = 0;

  const result = await protectAppRoute(async () => {
    calls += 1;
    return user;
  });

  assert.equal(calls, 1);
  assert.equal(result, user);
});

test("protected app routes redirect anonymous users to login", async () => {
  let destination = "";

  await assert.rejects(
    protectAppRoute(
      async () => null,
      (path) => {
        destination = path;
        throw new Error("redirect");
      },
    ),
    /redirect/,
  );

  assert.equal(destination, "/login");
});

test("auth pages remain outside the protected route group", () => {
  assert.equal(
    existsSync(new URL("../(auth)/login/page.tsx", import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL("../(auth)/register/page.tsx", import.meta.url)),
    true,
  );
  assert.equal(existsSync(new URL("./login/page.tsx", import.meta.url)), false);
  assert.equal(
    existsSync(new URL("./register/page.tsx", import.meta.url)),
    false,
  );
});

test("every active navigation route uses the protected route group", () => {
  const navigationUrl = new URL("../../components/Navigation.tsx", import.meta.url);
  const sourceFile = ts.createSourceFile(
    navigationUrl.pathname,
    readFileSync(navigationUrl, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hrefs: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "href" &&
      ts.isStringLiteral(node.initializer)
    ) {
      hrefs.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(hrefs.length > 0);

  for (const href of hrefs) {
    const route = href.replace(/^\//, "");
    assert.equal(
      existsSync(new URL(`./${route}/page.tsx`, import.meta.url)),
      true,
      `${href} must have a page under src/app/(app)`,
    );
    assert.equal(
      existsSync(new URL(`../${route}/page.tsx`, import.meta.url)),
      false,
      `${href} must not bypass the protected route group`,
    );
  }
});

test("protected add route renders the unified add-place flow", () => {
  const protectedAdd = new URL("./add/page.tsx", import.meta.url);
  const source = readFileSync(protectedAdd, "utf8");

  assert.match(source, /AddPlaceModal/);
  assert.equal(existsSync(new URL("../add/page.tsx", import.meta.url)), false);
});

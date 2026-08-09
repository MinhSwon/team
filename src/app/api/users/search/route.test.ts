import assert from "node:assert/strict";
import test from "node:test";

test("user search accepts 200 characters and rejects 201 before database query", async () => {
  const route = await import("./route") as typeof import("./route") & {
    handleUserSearch?: (
      request: Request,
      dependencies: {
        requireUser: () => Promise<{ id: string }>;
        rateLimit: (request: Request, userId: string) => Promise<void>;
        findUsers: (
          currentUserId: string,
          query: string,
        ) => Promise<Array<{ id: string; username: string; name: string }>>;
      },
    ) => Promise<Response>;
  };

  assert.equal(typeof route.handleUserSearch, "function");
  let databaseQueries = 0;
  const dependencies = {
    requireUser: async () => ({ id: "viewer-1" }),
    rateLimit: async () => {},
    findUsers: async (_currentUserId: string, query: string) => {
      databaseQueries += 1;
      assert.equal(query.length, 200);
      return [];
    },
  };

  const accepted = await route.handleUserSearch?.(
    new Request(`http://localhost/api/users/search?q=${"q".repeat(200)}`),
    dependencies,
  );
  assert.equal(accepted?.status, 200);
  assert.equal(databaseQueries, 1);

  const rejected = await route.handleUserSearch?.(
    new Request(`http://localhost/api/users/search?q=${"q".repeat(201)}`),
    dependencies,
  );
  assert.equal(rejected?.status, 400);
  assert.deepEqual(await rejected?.json(), {
    error: "Search query is too long",
  });
  assert.equal(databaseQueries, 1);
});

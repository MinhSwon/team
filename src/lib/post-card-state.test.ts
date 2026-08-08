import assert from "node:assert/strict";
import test from "node:test";

import {
  applyServerCount,
  createExclusiveAction,
  mergeCommentsById,
} from "./post-card-state";

test("exclusive action suppresses concurrent invocation", async () => {
  const run = createExclusiveAction();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;

  const first = run(async () => {
    calls += 1;
    await gate;
    return "done";
  });
  const second = run(async () => {
    calls += 1;
    return "duplicate";
  });

  assert.equal(await second, undefined);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, "done");
});

test("failed action releases lock and preserves prior state", async () => {
  const run = createExclusiveAction();
  let state = { liked: false, counts: { likes: 4 } };

  await assert.rejects(
    run(async () => {
      throw new Error("request failed");
    }),
    /request failed/,
  );
  assert.deepEqual(state, { liked: false, counts: { likes: 4 } });

  await run(async () => {
    state = {
      liked: true,
      counts: applyServerCount(state.counts, "likes", 5),
    };
  });
  assert.deepEqual(state, { liked: true, counts: { likes: 5 } });
});

test("server count replaces only requested count", () => {
  assert.deepEqual(
    applyServerCount(
      { likes: 2, comments: 3, reshares: 4 },
      "comments",
      8,
    ),
    { likes: 2, comments: 8, reshares: 4 },
  );
});

test("prop and local comments merge once by ID", () => {
  const props = [
    { id: "comment-1", body: "server copy" },
    { id: "comment-2", body: "older" },
  ];
  const local = [
    { id: "comment-1", body: "local copy" },
    { id: "comment-3", body: "new" },
    { id: "comment-3", body: "duplicate local" },
  ];

  assert.deepEqual(mergeCommentsById(props, local), [
    { id: "comment-1", body: "server copy" },
    { id: "comment-2", body: "older" },
    { id: "comment-3", body: "new" },
  ]);
});

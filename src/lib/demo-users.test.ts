import assert from "node:assert/strict";
import test from "node:test";

import { demoUserSelector, demoUsers } from "./demo-users";

test("demo reset targets only the three declared acceptance users", () => {
  assert.deepEqual(
    demoUsers.map(({ email, username }) => ({ email, username })),
    [
      { email: "alice@placedecide.local", username: "demo.alice" },
      { email: "bob@placedecide.local", username: "demo.bob" },
      { email: "carol@placedecide.local", username: "demo.carol" },
    ],
  );
  assert.deepEqual(demoUserSelector, {
    OR: [
      {
        email: {
          in: [
            "alice@placedecide.local",
            "bob@placedecide.local",
            "carol@placedecide.local",
          ],
        },
      },
      {
        username: {
          in: ["demo.alice", "demo.bob", "demo.carol"],
        },
      },
    ],
  });
});

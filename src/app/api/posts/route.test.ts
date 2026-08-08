import assert from "node:assert/strict";
import test from "node:test";

import type { Post } from "@prisma/client";

import {
  assertCanViewPost,
  type PostVisibilityStore,
} from "@/lib/friendships";

import { handlePostGet } from "./[id]/route";

const post: Post = {
  id: "post-1",
  authorId: "user-b",
  savedPlaceId: "saved-1",
  sourcePostId: null,
  createdAt: new Date("2026-08-08T00:00:00.000Z"),
  updatedAt: new Date("2026-08-08T00:00:00.000Z"),
  deletedAt: null,
};

test("post GET returns not-found for a nonfriend", async () => {
  const persistence: PostVisibilityStore = {
    findPost: async (id) => (id === post.id ? post : null),
    findFriendshipByPairKey: async () => null,
  };

  const response = await handlePostGet(
    { params: Promise.resolve({ id: post.id }) },
    {
      requireUser: async () => ({ id: "user-a" }),
      getPostDetail: async (userId, postId) => {
        await assertCanViewPost(userId, postId, persistence);
        assert.fail("nonfriend must not receive post detail");
      },
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Post not found" });
});

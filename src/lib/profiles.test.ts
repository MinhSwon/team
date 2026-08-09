import assert from "node:assert/strict";
import test from "node:test";

import type { FriendshipStatus } from "@prisma/client";

import {
  getProfile,
  ProfileError,
  updateProfile,
  type ProfilePersistence,
  type ProfilePost,
  type ProfileUserRecord,
} from "./profiles";

const createdAt = new Date("2026-08-08T12:00:00.000Z");

class FakeProfilePersistence implements ProfilePersistence {
  users: ProfileUserRecord[] = [
    {
      id: "user-a",
      username: "alice",
      name: "Alice",
      bio: "Coffee and quiet rooms.",
    },
    {
      id: "user-b",
      username: "bob",
      name: "Bob",
      bio: null,
    },
    {
      id: "user-c",
      username: "carol",
      name: "Carol",
      bio: null,
    },
  ];
  friendships = new Map<string, FriendshipStatus>();
  posts = new Map<string, ProfilePost[]>();

  async findUserByUsername(username: string) {
    return this.users.find((user) => user.username === username) ?? null;
  }

  async findVisibleProfile(viewerId: string, username: string) {
    const user = await this.findUserByUsername(username);
    if (!user) return null;
    const pairKey = [viewerId, user.id].sort().join(":");
    if (
      viewerId !== user.id &&
      this.friendships.get(pairKey) !== "ACCEPTED"
    ) {
      return null;
    }
    return {
      ...user,
      posts: this.posts.get(user.id) ?? [],
    };
  }

  async updateUser(
    userId: string,
    data: {
      name?: string;
      username?: string;
      bio?: string | null;
      image?: string | null;
    },
  ) {
    const index = this.users.findIndex((user) => user.id === userId);
    assert.notEqual(index, -1);
    this.users[index] = { ...this.users[index], ...data };
    return this.users[index];
  }
}

function post(id: string): ProfilePost {
  return {
    id,
    createdAt,
    savedPlace: {
      rating: 5,
      review: "Excellent.",
      tags: ["coffee"],
      place: {
        id: "place-1",
        name: "Cafe Central",
        address: "1 Main Street",
        area: null,
      },
      images: [],
    },
  };
}

test("profile read allows owner and accepted friend without exposing email", async () => {
  const persistence = new FakeProfilePersistence();
  persistence.friendships.set("user-a:user-b", "ACCEPTED");
  persistence.posts.set("user-b", [post("post-1")]);

  const ownerView = await getProfile("user-b", " BOB ", persistence);
  const friendView = await getProfile("user-a", "bob", persistence);

  assert.equal(ownerView.friendshipState, "SELF");
  assert.equal(friendView.friendshipState, "ACCEPTED");
  assert.deepEqual(friendView.posts.map((item) => item.id), ["post-1"]);
  assert.equal("email" in friendView, false);
  assert.equal("id" in friendView, false);
});

test("profile read hides pending friends and strangers as not found", async () => {
  const persistence = new FakeProfilePersistence();
  persistence.friendships.set("user-a:user-c", "PENDING");

  for (const username of ["carol", "missing"]) {
    await assert.rejects(
      getProfile("user-a", username, persistence),
      (error: unknown) =>
        error instanceof ProfileError &&
        error.code === "NOT_FOUND" &&
        error.status === 404,
      username,
    );
  }

  await assert.rejects(
    getProfile("user-b", "carol", persistence),
    (error: unknown) =>
      error instanceof ProfileError && error.code === "NOT_FOUND",
  );
});

test("profile update uses session user, normalizes fields, and checks exact username", async () => {
  const persistence = new FakeProfilePersistence();

  const updated = await updateProfile(
    "user-a",
    {
      name: "  Alice Smith  ",
      username: "  ALICE.SMITH  ",
      bio: "  New bio  ",
      avatar: null,
    },
    persistence,
  );

  assert.deepEqual(updated, {
    username: "alice.smith",
    name: "Alice Smith",
    bio: "New bio",
  });
  assert.equal(persistence.users[0]?.id, "user-a");

  await assert.rejects(
    updateProfile("user-a", { username: "BOB" }, persistence),
    (error: unknown) =>
      error instanceof ProfileError &&
      error.code === "USERNAME_TAKEN" &&
      error.status === 409,
  );
});

test("profile update rejects invalid fields and avatar URLs", async () => {
  const persistence = new FakeProfilePersistence();

  for (const input of [
    {},
    { name: " " },
    { username: "two words" },
    { bio: "b".repeat(501) },
    { avatar: "http://images.example/alice.jpg" },
    { email: "new@example.com" },
  ]) {
    await assert.rejects(
      updateProfile("user-a", input, persistence),
      (error: unknown) =>
        error instanceof ProfileError &&
        error.code === "INVALID_INPUT" &&
        error.status === 400,
    );
  }
});

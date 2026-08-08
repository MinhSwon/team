"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Profile = {
  username: string;
  name: string;
  avatar: string | null;
  bio: string | null;
};

const inputClassName =
  "mt-1.5 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20";

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState(profile.avatar ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, bio, avatar }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "Could not update profile",
        );
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("username" in body) ||
        typeof body.username !== "string"
      ) {
        throw new Error("Invalid profile response");
      }
      router.push(`/profile/${body.username}`);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update profile",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <label className="block text-sm font-medium text-slate-200">
        Name
        <input
          autoComplete="name"
          className={inputClassName}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Username
        <input
          autoCapitalize="none"
          autoComplete="username"
          className={inputClassName}
          maxLength={30}
          minLength={3}
          onChange={(event) => setUsername(event.target.value)}
          pattern="[A-Za-z0-9._]+"
          required
          value={username}
        />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Bio
        <textarea
          className={`${inputClassName} min-h-28 resize-y`}
          maxLength={500}
          onChange={(event) => setBio(event.target.value)}
          value={bio}
        />
        <span className="mt-1 block text-xs text-slate-500">
          {bio.length}/500
        </span>
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Avatar URL
        <input
          autoComplete="url"
          className={inputClassName}
          maxLength={500}
          onChange={(event) => setAvatar(event.target.value)}
          placeholder="https://"
          type="url"
          value={avatar}
        />
      </label>

      {error && (
        <p className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}

      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        <Save className="h-4 w-4" />
        {pending ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}

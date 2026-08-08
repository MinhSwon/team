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
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    setFeedback(null);
    setPending(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          username: form.get("username"),
          bio: form.get("bio"),
          avatar: form.get("avatar"),
        }),
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
      setFeedback({ kind: "success", message: "Profile updated" });
      formElement.reset();
      router.refresh();
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message:
          requestError instanceof Error
            ? requestError.message
            : "Could not update profile",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-5"
      key={[profile.name, profile.username, profile.bio, profile.avatar].join(
        "\0",
      )}
      onSubmit={submit}
    >
      <label className="block text-sm font-medium text-slate-200">
        Name
        <input
          autoComplete="name"
          className={inputClassName}
          defaultValue={profile.name}
          maxLength={80}
          name="name"
          required
        />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Username
        <input
          autoCapitalize="none"
          autoComplete="username"
          className={inputClassName}
          defaultValue={profile.username}
          maxLength={30}
          minLength={3}
          name="username"
          pattern="[A-Za-z0-9._]+"
          required
        />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Bio
        <textarea
          className={`${inputClassName} min-h-28 resize-y`}
          defaultValue={profile.bio ?? ""}
          maxLength={500}
          name="bio"
        />
      </label>

      <label className="block text-sm font-medium text-slate-200">
        Avatar URL
        <input
          autoComplete="url"
          className={inputClassName}
          defaultValue={profile.avatar ?? ""}
          maxLength={500}
          name="avatar"
          placeholder="https://"
          type="url"
        />
      </label>

      {feedback && (
        <p
          aria-live="polite"
          className={`text-sm ${
            feedback.kind === "error" ? "text-rose-400" : "text-emerald-400"
          }`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
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

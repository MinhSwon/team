"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  mode: "login" | "register";
};

const inputClassName =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20";

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const registering = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const result = registering
        ? await authClient.signUp.email({
            name,
            email,
            password,
            username,
          })
        : await authClient.signIn.email({
            email,
            password,
          });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed");
        return;
      }

      router.push("/feed");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl"
    >
      {registering && (
        <>
          <label className="block space-y-1.5 text-sm font-medium text-slate-200">
            <span>Name</span>
            <input
              autoComplete="name"
              className={inputClassName}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-slate-200">
            <span>Username</span>
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
        </>
      )}

      <label className="block space-y-1.5 text-sm font-medium text-slate-200">
        <span>Email</span>
        <input
          autoCapitalize="none"
          autoComplete="email"
          className={inputClassName}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="block space-y-1.5 text-sm font-medium text-slate-200">
        <span>Password</span>
        <input
          autoComplete={registering ? "new-password" : "current-password"}
          className={inputClassName}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      <button
        className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Please wait..."
          : registering
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}

import Link from "next/link";

import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-white">Sign in</h1>
          <p className="text-sm text-slate-400">
            Continue to your saved places and friends.
          </p>
        </div>
        <AuthForm mode="login" />
        <p className="text-center text-sm text-slate-400">
          New here?{" "}
          <Link
            href="/register"
            className="font-semibold text-amber-400 hover:text-amber-300"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

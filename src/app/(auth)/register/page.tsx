import Link from "next/link";

import AuthForm from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-white">Create account</h1>
          <p className="text-sm text-slate-400">
            Save places and share them with accepted friends.
          </p>
        </div>
        <AuthForm mode="register" />
        <p className="text-center text-sm text-slate-400">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-semibold text-amber-400 hover:text-amber-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

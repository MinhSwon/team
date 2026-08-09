import Navigation from "@/components/Navigation";
import { requireCurrentUser } from "@/lib/current-user";

import ProfileForm from "./ProfileForm";

export default async function ProfileSettingsPage() {
  const currentUser = await requireCurrentUser();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-7 border-b border-slate-800 pb-5">
          <h1 className="text-xl font-bold text-white">Edit profile</h1>
          <p className="mt-1 text-sm text-slate-400">
            Update details visible to accepted friends.
          </p>
        </div>
        <ProfileForm
          profile={{
            username: currentUser.username,
            name: currentUser.name,
            bio: currentUser.bio,
          }}
        />
      </main>
    </div>
  );
}

import { Plus } from "lucide-react";
import Link from "next/link";

import Navigation from "@/components/Navigation";
import PostCard from "@/components/PostCard";
import { requireCurrentUser } from "@/lib/current-user";
import { getFeed } from "@/lib/posts";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await requireCurrentUser();
  const { cursor } = await searchParams;
  const page = await getFeed(currentUser.id, cursor);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Feed</h1>
            <p className="mt-1 text-sm text-slate-400">
              Places shared by you and accepted friends.
            </p>
          </div>
          <Link
            aria-label="Add place"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-amber-400 text-slate-950 hover:bg-amber-300"
            href="/add"
            title="Add place"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>

        {page.items.length === 0 ? (
          <div className="border-y border-slate-800 py-12 text-center">
            <p className="font-semibold text-white">No posts yet</p>
            <p className="mt-2 text-sm text-slate-400">
              Save a place or add accepted friends to fill your feed.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {page.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {page.nextCursor && (
          <Link
            className="mt-6 flex min-h-11 items-center justify-center rounded-md border border-slate-700 text-sm font-semibold text-slate-300 hover:border-amber-400 hover:text-white"
            href={`/feed?cursor=${encodeURIComponent(page.nextCursor)}`}
          >
            Older posts
          </Link>
        )}
      </main>
    </div>
  );
}

import { MapPin, Pencil, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import Navigation from "@/components/Navigation";
import { requireCurrentUser } from "@/lib/current-user";
import { getProfile, ProfileError } from "@/lib/profiles";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
});

function initials(name: string, username: string) {
  return (name.trim() || username).slice(0, 2).toUpperCase();
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const currentUser = await requireCurrentUser();
  const { username } = await params;
  let profile;

  try {
    profile = await getProfile(currentUser.id, username);
  } catch (error) {
    if (error instanceof ProfileError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <section className="flex items-start gap-4 border-b border-slate-800 pb-7">
          {profile.avatar ? (
            <span
              aria-label={`${profile.name} avatar`}
              className="h-20 w-20 shrink-0 rounded-full bg-cover bg-center ring-1 ring-slate-700"
              role="img"
              style={{ backgroundImage: `url("${profile.avatar}")` }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-slate-800 text-xl font-bold text-amber-400"
            >
              {initials(profile.name, profile.username)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="break-words text-xl font-bold text-white">
                  {profile.name}
                </h1>
                <p className="break-all text-sm text-slate-400">
                  @{profile.username}
                </p>
              </div>
              {profile.friendshipState === "SELF" && (
                <Link
                  aria-label="Edit profile"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-white"
                  href="/settings/profile"
                  title="Edit profile"
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              )}
            </div>
            {profile.bio && (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                {profile.bio}
              </p>
            )}
          </div>
        </section>

        <section className="pt-7">
          <h2 className="text-sm font-bold uppercase text-slate-300">
            Shared places
          </h2>

          {profile.posts.length === 0 ? (
            <p className="mt-4 border-y border-slate-800 py-10 text-center text-sm text-slate-500">
              No shared places yet.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-800 border-y border-slate-800">
              {profile.posts.map((post) => {
                const image = post.savedPlace.images[0]?.url;
                return (
                  <article className="py-5" key={post.id}>
                    <Link
                      className="group grid gap-4 sm:grid-cols-[8rem_1fr]"
                      href={`/places/${post.savedPlace.place.id}`}
                    >
                      {image ? (
                        <span
                          aria-label={post.savedPlace.place.name}
                          className="aspect-[16/9] rounded-md bg-cover bg-center sm:aspect-square"
                          role="img"
                          style={{ backgroundImage: `url("${image}")` }}
                        />
                      ) : (
                        <span className="hidden rounded-md bg-slate-900 sm:block" />
                      )}
                      <span className="min-w-0">
                        <span className="flex items-start justify-between gap-3">
                          <span className="break-words font-semibold text-white group-hover:text-amber-400">
                            {post.savedPlace.place.name}
                          </span>
                          <time
                            className="shrink-0 text-xs text-slate-500"
                            dateTime={post.createdAt.toISOString()}
                          >
                            {dateFormat.format(post.createdAt)}
                          </time>
                        </span>
                        <span className="mt-1 flex items-start gap-1.5 text-sm text-slate-400">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="break-words">
                            {post.savedPlace.place.address}
                            {post.savedPlace.place.area
                              ? `, ${post.savedPlace.place.area}`
                              : ""}
                          </span>
                        </span>
                        {post.savedPlace.rating && (
                          <span className="mt-2 flex items-center gap-1 text-sm font-semibold text-amber-400">
                            <Star className="h-4 w-4 fill-current" />
                            {post.savedPlace.rating}/5
                          </span>
                        )}
                        {post.savedPlace.review && (
                          <span className="mt-2 line-clamp-3 block whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                            {post.savedPlace.review}
                          </span>
                        )}
                      </span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

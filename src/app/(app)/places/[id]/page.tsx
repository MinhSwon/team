import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import Navigation from "@/components/Navigation";
import { requireCurrentUser } from "@/lib/current-user";
import { getPlaceDetail, PostError } from "@/lib/posts";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requireCurrentUser();
  const { id } = await params;
  let detail;

  try {
    detail = await getPlaceDetail(currentUser.id, id);
  } catch (error) {
    if (error instanceof PostError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold text-white">
            {detail.place.name}
          </h1>
          <p className="mt-2 flex items-start gap-2 text-sm text-slate-400">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{detail.place.address}</span>
          </p>
        </header>

        <section className="border-b border-slate-800 py-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-white">Your save</h2>
            {!detail.currentUserSave && (
              <Link
                className="rounded-md bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300"
                href="/add"
              >
                Save place
              </Link>
            )}
          </div>

          {detail.currentUserSave ? (
            <Review
              rating={detail.currentUserSave.rating}
              review={detail.currentUserSave.review}
              tags={detail.currentUserSave.tags}
            />
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              This place is not in your library.
            </p>
          )}
        </section>

        <section className="py-6">
          <h2 className="text-lg font-bold text-white">Friend reviews</h2>
          {detail.reviews.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No accepted friend has reviewed this place.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-800 border-y border-slate-800">
              {detail.reviews.map((savedPlace) => (
                <article className="py-5" key={savedPlace.id}>
                  <p className="font-semibold text-white">
                    {savedPlace.user.name}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      @{savedPlace.user.username}
                    </span>
                  </p>
                  <Review
                    rating={savedPlace.rating}
                    review={savedPlace.review}
                    tags={savedPlace.tags}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Review({
  rating,
  review,
  tags,
}: {
  rating: number | null;
  review: string | null;
  tags: string[];
}) {
  return (
    <div className="mt-3 space-y-3">
      {rating && (
        <p className="flex items-center gap-1 text-sm font-semibold text-amber-400">
          <Star className="h-4 w-4 fill-current" />
          {rating}/5
        </p>
      )}
      {review && (
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
          {review}
        </p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              className="rounded-sm bg-slate-800 px-2 py-1 text-xs text-slate-300"
              key={tag}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

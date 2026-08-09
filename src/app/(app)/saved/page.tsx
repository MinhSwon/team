import { Bookmark } from "lucide-react";

import Navigation from "@/components/Navigation";
import SavedPlacesClient from "@/components/SavedPlacesClient";
import { requireCurrentUser } from "@/lib/current-user";
import { getSavedPlaces } from "@/lib/posts";

export default async function SavedPage() {
  const currentUser = await requireCurrentUser();
  const savedPlaces = await getSavedPlaces(currentUser.id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Bookmark className="h-6 w-6 text-amber-400" />
            Saved places
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your canonical place library, stored in the database.
          </p>
        </div>

        <SavedPlacesClient
          initialItems={savedPlaces.map((savedPlace) => ({
            id: savedPlace.id,
            status: savedPlace.status,
            rating: savedPlace.rating,
            review: savedPlace.review,
            tags: savedPlace.tags,
            imageUrl: savedPlace.images[0]?.url ?? null,
            place: {
              id: savedPlace.place.id,
              name: savedPlace.place.name,
              address: savedPlace.place.address,
              area: savedPlace.place.area,
            },
          }))}
        />
      </main>
    </div>
  );
}

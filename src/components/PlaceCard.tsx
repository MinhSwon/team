import { Bookmark, MapPin, Star } from "lucide-react";
import Link from "next/link";

type SavedPlaceCardProps = {
  id: string;
  name: string;
  address: string;
  area: string | null;
  rating: number | null;
  review: string | null;
  tags: string[];
  imageUrl: string | null;
};

export default function PlaceCard({
  place,
}: {
  place: SavedPlaceCardProps;
}) {
  return (
    <Link
      className="group block overflow-hidden rounded-md border border-slate-800 bg-slate-900 hover:border-amber-400/60"
      href={`/places/${place.id}`}
    >
      {place.imageUrl ? (
        <div
          aria-label={place.name}
          className="aspect-[16/9] bg-cover bg-center"
          role="img"
          style={{ backgroundImage: `url("${place.imageUrl}")` }}
        />
      ) : (
        <div className="grid aspect-[16/9] place-items-center bg-slate-800 text-slate-500">
          <Bookmark className="h-8 w-8" />
        </div>
      )}

      <div className="space-y-3 p-4">
        <div>
          <h2 className="font-bold text-white group-hover:text-amber-400">
            {place.name}
          </h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-400">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {place.address}
              {place.area ? `, ${place.area}` : ""}
            </span>
          </p>
        </div>

        {place.rating && (
          <p className="flex items-center gap-1 text-sm font-semibold text-amber-400">
            <Star className="h-4 w-4 fill-current" />
            {place.rating}/5
          </p>
        )}

        {place.review && (
          <p className="line-clamp-3 text-sm text-slate-300">
            {place.review}
          </p>
        )}

        {place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {place.tags.slice(0, 4).map((tag) => (
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
    </Link>
  );
}

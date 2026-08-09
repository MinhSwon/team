"use client";

import { MapPin, Pencil, Search, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type SavedPlaceStatus = "SAVED" | "WANT_TO_GO" | "VISITED";

export type SavedPlaceListItem = {
  id: string;
  status: SavedPlaceStatus;
  rating: number | null;
  review: string | null;
  tags: string[];
  imageUrl: string | null;
  place: {
    id: string;
    name: string;
    address: string;
    area: string | null;
  };
};

const statusLabels: Record<SavedPlaceStatus, string> = {
  SAVED: "Saved",
  WANT_TO_GO: "Want to go",
  VISITED: "Visited",
};

export default function SavedPlacesClient({
  initialItems,
}: {
  initialItems: SavedPlaceListItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | SavedPlaceStatus>("ALL");
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (status === "ALL" || item.status === status) &&
        (!normalized ||
          `${item.place.name} ${item.place.address} ${item.tags.join(" ")}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [items, query, status]);

  async function remove(item: SavedPlaceListItem) {
    if (!window.confirm(`Remove ${item.place.name} from saved places?`)) return;
    setRemoving(item.id);
    setError("");
    try {
      const response = await fetch(`/api/saved/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data: unknown = await response.json();
        throw new Error(
          typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
            ? data.error
            : "Could not remove saved place",
        );
      }
      setItems((current) => current.filter(({ id }) => id !== item.id));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not remove saved place",
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <div className="grid gap-3 border-y border-slate-800 py-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative block">
          <span className="sr-only">Search saved places</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved places"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="sr-only">Status filter</span>
          <select
            aria-label="Status filter"
            className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            onChange={(event) =>
              setStatus(event.target.value as "ALL" | SavedPlaceStatus)
            }
            value={status}
          >
            <option value="ALL">All statuses</option>
            <option value="SAVED">Saved</option>
            <option value="WANT_TO_GO">Want to go</option>
            <option value="VISITED">Visited</option>
          </select>
        </label>
      </div>

      {visibleItems.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          No saved places match.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {visibleItems.map((item) => (
            <li
              className="grid gap-4 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center"
              key={item.id}
            >
              <Link
                className="relative block aspect-[4/3] overflow-hidden rounded-md bg-slate-900"
                href={`/places/${item.place.id}`}
              >
                {item.imageUrl ? (
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="(min-width: 640px) 6rem, 100vw"
                    src={item.imageUrl}
                    unoptimized
                  />
                ) : (
                  <span className="grid h-full place-items-center text-slate-600">
                    <MapPin className="h-6 w-6" />
                  </span>
                )}
              </Link>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-bold text-white hover:text-amber-400"
                    href={`/places/${item.place.id}`}
                  >
                    {item.place.name}
                  </Link>
                  <span className="rounded-sm bg-slate-800 px-2 py-1 text-xs text-slate-300">
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-400">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {item.place.address}
                    {item.place.area ? `, ${item.place.area}` : ""}
                  </span>
                </p>
                {item.rating && (
                  <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-amber-400">
                    <Star className="h-4 w-4 fill-current" />
                    {item.rating}/5
                  </p>
                )}
                {item.review && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                    {item.review}
                  </p>
                )}
              </div>

              <div className="flex gap-2 sm:flex-col">
                <Link
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-semibold text-slate-200 hover:border-amber-400"
                  href={`/places/${item.place.id}#your-save`}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
                <button
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-900 px-3 text-sm font-semibold text-rose-300 hover:bg-rose-950 disabled:opacity-50"
                  disabled={removing === item.id}
                  onClick={() => void remove(item)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p aria-live="polite" className="mt-3 text-sm text-rose-400">
          {error}
        </p>
      )}
    </>
  );
}

"use client";

import {
  Check,
  ImagePlus,
  Link2,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  placeInputForSave,
  type ConfirmedPlace,
} from "@/lib/place-save-payload";
import type { PlaceCandidate, PlaceInput } from "@/lib/places";
import {
  PLACE_LIMITS,
  assertPlaceReview,
} from "@/lib/validation";

type Method = "search" | "mapsUrl" | "manual";
type Busy = "search" | "resolve" | "upload" | "save" | null;
type UploadedImage = { name: string; url: string };
type AddPlaceModalProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

const methods: Array<{
  value: Method;
  label: string;
  icon: typeof Search;
}> = [
  { value: "search", label: "Search", icon: Search },
  { value: "mapsUrl", label: "Maps Link", icon: Link2 },
  { value: "manual", label: "Manual", icon: MapPin },
];

function MethodTabs({
  method,
  onChange,
}: {
  method: Method;
  onChange: (method: Method) => void;
}) {
  return (
    <div
      aria-label="Place entry method"
      className="grid grid-cols-3 border border-slate-700"
      role="tablist"
    >
      {methods.map((item) => {
        const Icon = item.icon;
        const active = method === item.value;
        return (
          <button
            aria-selected={active}
            className={`flex min-h-11 items-center justify-center gap-2 border-r border-slate-700 px-2 text-sm font-semibold last:border-r-0 ${
              active
                ? "bg-amber-400 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function EntryPanel({
  onConfirmed,
}: {
  onConfirmed: (place: ConfirmedPlace) => void;
}) {
  const [method, setMethod] = useState<Method>("search");
  const [query, setQuery] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");

  async function resolveInput(input: PlaceInput) {
    setBusy("resolve");
    setError("");
    try {
      const data = await api<
        | { place: ConfirmedPlace; requiresConfirmation?: false }
        | {
            place: { name: string; address: string };
            requiresConfirmation: true;
          }
      >("/api/places/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      onConfirmed(data.place);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
  }

  async function searchPlaces(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;

    setBusy("search");
    setError("");
    try {
      const data = await api<{ candidates: PlaceCandidate[] }>(
        `/api/places/search?q=${encodeURIComponent(term)}`,
      );
      setResults(data.candidates);
      if (data.candidates.length === 0) {
        setError("No matches found. Try Manual.");
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <MethodTabs
        method={method}
        onChange={(value) => {
          setMethod(value);
          setError("");
        }}
      />

      <section className="py-7">
        {method === "search" && (
          <>
            <form className="flex gap-2" onSubmit={searchPlaces}>
              <label className="sr-only" htmlFor="place-search">
                Search places
              </label>
              <input
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
                id="place-search"
                maxLength={PLACE_LIMITS.query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or address"
                type="search"
                value={query}
              />
              <button
                aria-label="Search places"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                disabled={busy !== null}
                title="Search places"
                type="submit"
              >
                {busy === "search" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </form>

            {results.length > 0 && (
              <ul className="mt-5 grid gap-2">
                {results.map((candidate) => (
                  <li
                    key={
                      candidate.source === "local"
                        ? candidate.id
                        : candidate.externalPlaceId
                    }
                  >
                    <button
                      className="flex w-full items-start gap-3 rounded-md border border-slate-800 bg-slate-900 p-3 text-left hover:border-amber-400/70 disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() =>
                        void resolveInput({ type: "search", candidate })
                      }
                      type="button"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          {candidate.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {candidate.address}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {method === "mapsUrl" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (mapsLink.trim()) {
                void resolveInput({
                  type: "mapsUrl",
                  url: mapsLink.trim(),
                });
              }
            }}
          >
            <div>
              <label
                className="mb-1.5 block text-sm font-semibold text-slate-300"
                htmlFor="maps-link"
              >
                Google Maps URL
              </label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
                id="maps-link"
                onChange={(event) => setMapsLink(event.target.value)}
                placeholder="https://www.google.com/maps/..."
                required
                type="url"
                value={mapsLink}
              />
            </div>
            <ResolveButton busy={busy}>Resolve link</ResolveButton>
          </form>
        )}

        {method === "manual" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void resolveInput({
                type: "manual",
                name: manualName,
                address: manualAddress,
              });
            }}
          >
            <div>
              <label
                className="mb-1.5 block text-sm font-semibold text-slate-300"
                htmlFor="manual-name"
              >
                Name
              </label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                id="manual-name"
                maxLength={PLACE_LIMITS.name}
                onChange={(event) => setManualName(event.target.value)}
                required
                value={manualName}
              />
            </div>
            <div>
              <label
                className="mb-1.5 block text-sm font-semibold text-slate-300"
                htmlFor="manual-address"
              >
                Address
              </label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                id="manual-address"
                maxLength={PLACE_LIMITS.address}
                onChange={(event) => setManualAddress(event.target.value)}
                required
                value={manualAddress}
              />
            </div>
            <ResolveButton busy={busy}>Confirm place</ResolveButton>
          </form>
        )}

        {error && (
          <p aria-live="polite" className="mt-4 text-sm text-rose-400">
            {error}
          </p>
        )}
      </section>
    </>
  );
}

function ResolveButton({
  busy,
  children,
}: {
  busy: Busy;
  children: React.ReactNode;
}) {
  return (
    <button
      className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
      disabled={busy !== null}
      type="submit"
    >
      {busy === "resolve" ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Check className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}

export function ConfirmationPlaceFields({
  place,
  onChange,
}: {
  place: ConfirmedPlace;
  onChange: (place: ConfirmedPlace) => void;
}) {
  const canonical = Boolean(place.id);

  return (
    <>
      {canonical && (
        <p
          className="text-sm text-emerald-300"
          id="canonical-place-state"
        >
          Canonical place details are locked.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            className="mb-1.5 block text-sm font-semibold text-slate-300"
            htmlFor="confirmed-name"
          >
            Name
          </label>
          <input
            aria-describedby={
              canonical ? "canonical-place-state" : undefined
            }
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none read-only:cursor-not-allowed read-only:text-slate-400 focus:border-amber-400"
            id="confirmed-name"
            maxLength={PLACE_LIMITS.name}
            onChange={(event) =>
              onChange({ ...place, name: event.target.value })
            }
            readOnly={canonical}
            required
            value={place.name}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-sm font-semibold text-slate-300"
            htmlFor="confirmed-address"
          >
            Address
          </label>
          <input
            aria-describedby={
              canonical ? "canonical-place-state" : undefined
            }
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none read-only:cursor-not-allowed read-only:text-slate-400 focus:border-amber-400"
            id="confirmed-address"
            maxLength={PLACE_LIMITS.address}
            onChange={(event) =>
              onChange({ ...place, address: event.target.value })
            }
            readOnly={canonical}
            required
            value={place.address}
          />
        </div>
      </div>
    </>
  );
}

function ConfirmationForm({
  initialPlace,
  onReset,
  onSuccess,
}: {
  initialPlace: ConfirmedPlace;
  onReset: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [place, setPlace] = useState(initialPlace);
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [tags, setTags] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;

    setBusy("upload");
    setUploadError("");
    const outcomes = await Promise.allSettled(
      files.map(async (file): Promise<UploadedImage> => {
        const body = new FormData();
        body.set("image", file);
        const uploaded = await api<{ url: string }>("/api/uploads", {
          method: "POST",
          body,
        });
        return { name: file.name, url: uploaded.url };
      }),
    );
    const uploaded = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : [],
    );
    const failure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );

    if (uploaded.length > 0) {
      setImages((current) => [...current, ...uploaded]);
    }
    if (failure) setUploadError(errorMessage(failure.reason));
    setBusy(null);
  }

  async function savePlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setSaveError("");

    try {
      const result = await api<{
        savedPlace: { placeId: string };
        post: { id: string };
      }>("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place: placeInputForSave(place),
          rating,
          review,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          images: images.map((image) => ({
            url: image.url,
            caption: null,
          })),
        }),
      });

      onSuccess?.();
      router.push(`/places/${result.savedPlace.placeId}`);
      router.refresh();
    } catch (error) {
      setSaveError(errorMessage(error));
      setBusy(null);
    }
  }

  return (
    <form className="space-y-6 py-7" onSubmit={savePlace}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">Confirm details</h2>
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={onReset}
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Start over
        </button>
      </div>

      <ConfirmationPlaceFields place={place} onChange={setPlace} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-300">
          Rating
        </legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              aria-pressed={rating === value}
              className={`grid h-10 w-10 place-items-center rounded-md ${
                rating !== null && value <= rating
                  ? "bg-amber-400 text-slate-950"
                  : "bg-slate-900 text-slate-500 hover:text-amber-400"
              }`}
              key={value}
              onClick={() => setRating(rating === value ? null : value)}
              title={`${value} star${value === 1 ? "" : "s"}`}
              type="button"
            >
              <Star className="h-4 w-4" />
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          className="mb-1.5 block text-sm font-semibold text-slate-300"
          htmlFor="place-review"
        >
          Review
        </label>
        <textarea
          className="min-h-28 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
          id="place-review"
          maxLength={PLACE_LIMITS.review}
          onChange={(event) =>
            setReview(assertPlaceReview(event.target.value))
          }
          placeholder="What should friends know?"
          value={review}
        />
      </div>

      <div>
        <label
          className="mb-1.5 block text-sm font-semibold text-slate-300"
          htmlFor="place-tags"
        >
          Tags
        </label>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
          id="place-tags"
          onChange={(event) => setTags(event.target.value)}
          placeholder="coffee, date night, quiet"
          value={tags}
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-300">Photos</span>
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-slate-800"
            htmlFor="place-images"
          >
            {busy === "upload" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Upload
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy !== null}
            id="place-images"
            multiple
            onChange={(event) => void uploadImages(event)}
            type="file"
          />
        </div>
        {images.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-800 border-y border-slate-800">
            {images.map((image) => (
              <li
                className="flex min-h-11 items-center gap-3 py-2"
                key={image.url}
              >
                <ImagePlus className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                  {image.name}
                </span>
                <button
                  aria-label={`Remove ${image.name}`}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                  onClick={() =>
                    setImages((current) =>
                      current.filter((item) => item.url !== image.url),
                    )
                  }
                  title="Remove image"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {uploadError && (
          <p aria-live="polite" className="mt-2 text-sm text-rose-400">
            {uploadError}
          </p>
        )}
      </div>

      <div className="border-t border-slate-800 pt-5">
        <button
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
          disabled={busy !== null}
          type="submit"
        >
          {busy === "save" && (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          )}
          Save and share
        </button>
        {saveError && (
          <p
            aria-live="polite"
            className="mt-2 text-center text-sm text-rose-400"
          >
            {saveError}
          </p>
        )}
      </div>
    </form>
  );
}

export default function AddPlaceModal({
  isOpen = true,
  onClose,
  onSuccess,
}: AddPlaceModalProps) {
  const [confirmation, setConfirmation] = useState<ConfirmedPlace | null>(
    null,
  );

  if (!isOpen) return null;

  const content = (
    <div
      aria-labelledby={onClose ? "add-place-title" : undefined}
      aria-modal={onClose ? true : undefined}
      className={
        onClose
          ? "max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:p-7"
          : "w-full"
      }
      role={onClose ? "dialog" : undefined}
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1
            className="text-2xl font-bold text-white"
            id={onClose ? "add-place-title" : undefined}
          >
            Add place
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Resolve one place, then add optional context for friends.
          </p>
        </div>
        {onClose && (
          <button
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="mt-6">
        {confirmation ? (
          <ConfirmationForm
            initialPlace={confirmation}
            onReset={() => setConfirmation(null)}
            onSuccess={onSuccess}
          />
        ) : (
          <EntryPanel onConfirmed={setConfirmation} />
        )}
      </div>
    </div>
  );

  return onClose ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-4">
      {content}
    </div>
  ) : (
    content
  );
}

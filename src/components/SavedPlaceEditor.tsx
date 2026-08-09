"use client";

import { LoaderCircle, Save, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useReducer } from "react";
import type { FormEvent } from "react";

import { PLACE_LIMITS } from "@/lib/validation";

type SavedPlaceStatus = "SAVED" | "WANT_TO_GO" | "VISITED";
type SavedState = {
  id: string;
  rating: number | null;
  review: string | null;
  tags: string[];
  status: SavedPlaceStatus;
};

type EditorState = {
  saved: SavedState | null;
  rating: number | null;
  review: string;
  tags: string;
  status: SavedPlaceStatus;
  busy: "save" | "remove" | null;
  error: string;
};

type CanonicalPlace = {
  id: string;
  name: string;
  address: string;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
};

function createEditorState(saved: SavedState | null): EditorState {
  return {
    saved,
    rating: saved?.rating ?? null,
    review: saved?.review ?? "",
    tags: saved?.tags.join(", ") ?? "",
    status: saved?.status ?? "SAVED",
    busy: null,
    error: "",
  };
}

function updateEditorState(
  state: EditorState,
  update: Partial<EditorState>,
): EditorState {
  return { ...state, ...update };
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Saved place request failed",
    );
  }
  return data as T;
}

export default function SavedPlaceEditor({
  place,
  initialSave,
}: {
  place: CanonicalPlace;
  initialSave: SavedState | null;
}) {
  const router = useRouter();
  const [{ saved, rating, review, tags, status, busy, error }, updateState] =
    useReducer(
      updateEditorState,
      initialSave,
      createEditorState,
    );

  function payload() {
    return {
      rating,
      review,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      status,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateState({ busy: "save", error: "" });
    try {
      const result = saved
        ? await jsonRequest<{ savedPlace: SavedState }>(
            `/api/saved/${saved.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload()),
            },
          )
        : await jsonRequest<{ savedPlace: SavedState }>("/api/saved", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload(),
              place: {
                type: "search",
                candidate: {
                  source: "local",
                  ...place,
                },
              },
              images: [],
              sourcePostId: null,
            }),
          });
      updateState({ saved: result.savedPlace });
      router.refresh();
    } catch (nextError) {
      updateState({
        error: nextError instanceof Error ? nextError.message : "Save failed",
      });
    } finally {
      updateState({ busy: null });
    }
  }

  async function remove() {
    if (!saved || !window.confirm(`Remove ${place.name} from saved places?`)) {
      return;
    }
    updateState({ busy: "remove", error: "" });
    try {
      await jsonRequest(`/api/saved/${saved.id}`, { method: "DELETE" });
      updateState(createEditorState(null));
      router.refresh();
    } catch (nextError) {
      updateState({
        error:
          nextError instanceof Error ? nextError.message : "Remove failed",
      });
    } finally {
      updateState({ busy: null });
    }
  }

  return (
    <form className="mt-4 space-y-5" id="your-save" onSubmit={submit}>
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
              onClick={() =>
                updateState({ rating: rating === value ? null : value })
              }
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
          htmlFor="saved-review"
        >
          Review
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
          id="saved-review"
          maxLength={PLACE_LIMITS.review}
          onChange={(event) => updateState({ review: event.target.value })}
          value={review}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            className="mb-1.5 block text-sm font-semibold text-slate-300"
            htmlFor="saved-tags"
          >
            Tags
          </label>
          <input
            className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            id="saved-tags"
            onChange={(event) => updateState({ tags: event.target.value })}
            placeholder="coffee, quiet"
            value={tags}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-sm font-semibold text-slate-300"
            htmlFor="saved-status"
          >
            Status
          </label>
          <select
            className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            id="saved-status"
            onChange={(event) =>
              updateState({
                status: event.target.value as SavedPlaceStatus,
              })
            }
            value={status}
          >
            <option value="SAVED">Saved</option>
            <option value="WANT_TO_GO">Want to go</option>
            <option value="VISITED">Visited</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row">
        <button
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
          disabled={busy !== null}
          type="submit"
        >
          {busy === "save" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saved ? "Update save" : "Save place"}
        </button>
        {saved && (
          <button
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-rose-900 px-4 text-sm font-semibold text-rose-300 hover:bg-rose-950 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void remove()}
            type="button"
          >
            {busy === "remove" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Remove save
          </button>
        )}
      </div>

      {error && (
        <p aria-live="polite" className="text-sm text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
}

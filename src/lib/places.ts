import type { Place } from "@prisma/client";

import { prisma } from "@/lib/db";
import { normalizePlaceText } from "@/lib/validation";

export type PlaceCandidate =
  | {
      source: "local";
      id: string;
      name: string;
      address: string;
      area: string | null;
      latitude: number | null;
      longitude: number | null;
      website: string | null;
    }
  | {
      source: "google";
      externalPlaceId: string;
      name: string;
      address: string;
      area?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      website?: string | null;
    };

type GooglePlaceCandidate = Extract<PlaceCandidate, { source: "google" }>;

export type PlaceInput =
  | { type: "search"; candidate: PlaceCandidate }
  | { type: "mapsUrl"; url: string }
  | {
      type: "manual";
      name: string;
      address: string;
      area?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      website?: string | null;
    };

export type CanonicalPlaceData = Omit<
  Place,
  "id" | "createdAt" | "updatedAt"
>;

export interface PlaceStore {
  findById(id: string): Promise<Place | null>;
  findByExternal(
    externalSource: string,
    externalPlaceId: string,
  ): Promise<Place | null>;
  findByNormalized(
    normalizedName: string,
    normalizedAddress: string,
  ): Promise<Place | null>;
  searchLocal(normalizedQuery: string): Promise<Place[]>;
  create(data: CanonicalPlaceData): Promise<Place>;
}

export class PlaceResolutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "INVALID_MAPS_URL"
      | "MANUAL_CONFIRMATION_REQUIRED"
      | "NOT_FOUND",
    public readonly status: number,
    public readonly fallback?: { name: string; address: string },
  ) {
    super(message);
    this.name = "PlaceResolutionError";
  }
}

function invalidInput(): never {
  throw new PlaceResolutionError(
    "Invalid place input",
    "INVALID_INPUT",
    400,
  );
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") invalidInput();
  return value;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) invalidInput();
  return value;
}

export function parsePlaceInput(value: unknown): PlaceInput {
  const input = record(value);
  if (!input || typeof input.type !== "string") invalidInput();

  if (input.type === "mapsUrl") {
    if (typeof input.url !== "string" || !input.url.trim()) invalidInput();
    return { type: "mapsUrl", url: input.url };
  }

  if (input.type === "manual") {
    if (
      typeof input.name !== "string" ||
      typeof input.address !== "string"
    ) {
      invalidInput();
    }
    return {
      type: "manual",
      name: input.name,
      address: input.address,
      area: optionalText(input.area),
      latitude: optionalNumber(input.latitude),
      longitude: optionalNumber(input.longitude),
      website: optionalText(input.website),
    };
  }

  if (input.type === "search") {
    const candidate = record(input.candidate);
    if (
      !candidate ||
      typeof candidate.source !== "string" ||
      typeof candidate.name !== "string" ||
      !candidate.name.trim() ||
      typeof candidate.address !== "string" ||
      !candidate.address.trim()
    ) {
      invalidInput();
    }

    if (candidate.source === "local") {
      if (typeof candidate.id !== "string" || !candidate.id.trim()) {
        invalidInput();
      }
      return {
        type: "search",
        candidate: {
          source: "local",
          id: candidate.id,
          name: candidate.name,
          address: candidate.address,
          area: optionalText(candidate.area) ?? null,
          latitude: optionalNumber(candidate.latitude) ?? null,
          longitude: optionalNumber(candidate.longitude) ?? null,
          website: optionalText(candidate.website) ?? null,
        },
      };
    }

    if (
      candidate.source !== "google" ||
      typeof candidate.externalPlaceId !== "string" ||
      !candidate.externalPlaceId.trim()
    ) {
      invalidInput();
    }
    return {
      type: "search",
      candidate: {
        source: "google",
        externalPlaceId: candidate.externalPlaceId,
        name: candidate.name,
        address: candidate.address,
        area: optionalText(candidate.area),
        latitude: optionalNumber(candidate.latitude),
        longitude: optionalNumber(candidate.longitude),
        website: optionalText(candidate.website),
      },
    };
  }

  return invalidInput();
}

export type PlaceDependencies = {
  store?: PlaceStore;
  fetch?: typeof fetch;
  apiKey?: string;
};

const defaultStore: PlaceStore = {
  findById: (id) => prisma.place.findUnique({ where: { id } }),
  findByExternal: (externalSource, externalPlaceId) =>
    prisma.place.findUnique({
      where: {
        externalSource_externalPlaceId: {
          externalSource,
          externalPlaceId,
        },
      },
    }),
  findByNormalized: (normalizedName, normalizedAddress) =>
    prisma.place.findFirst({
      where: { normalizedName, normalizedAddress },
      orderBy: { id: "asc" },
    }),
  searchLocal: (normalizedQuery) =>
    prisma.place.findMany({
      where: {
        OR: [
          { normalizedName: { contains: normalizedQuery } },
          { normalizedAddress: { contains: normalizedQuery } },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 20,
    }),
  create: (data) => prisma.place.create({ data }),
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function googleCandidate(value: unknown): GooglePlaceCandidate | null {
  const item = record(value);
  const displayName = record(item?.displayName);
  const location = record(item?.location);
  const externalPlaceId = text(item?.id);
  const name = text(displayName?.text);
  const address = text(item?.formattedAddress);

  if (!externalPlaceId || !name || !address) return null;

  return {
    source: "google",
    externalPlaceId,
    name,
    address,
    latitude: number(location?.latitude),
    longitude: number(location?.longitude),
    website: text(item?.websiteUri),
  };
}

function localCandidate(place: Place): PlaceCandidate {
  return {
    source: "local",
    id: place.id,
    name: place.name,
    address: place.address,
    area: place.area,
    latitude: place.latitude,
    longitude: place.longitude,
    website: place.website,
  };
}

async function searchGoogle(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<GooglePlaceCandidate[]> {
  const response = await fetchFn(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
      },
      body: JSON.stringify({ textQuery: query }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Places search failed with ${response.status}`);
  }

  const body = record(await response.json());
  const places = Array.isArray(body?.places) ? body.places : [];
  return places
    .map(googleCandidate)
    .filter(
      (candidate): candidate is GooglePlaceCandidate => candidate !== null,
    );
}

function mapsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PlaceResolutionError(
      "Enter a valid Google Maps URL",
      "INVALID_MAPS_URL",
      400,
    );
  }

  const host = url.hostname.toLowerCase();
  const googleMapsPath =
    url.pathname === "/maps" || url.pathname.startsWith("/maps/");
  const allowed =
    ((host === "google.com" || host === "www.google.com") &&
      googleMapsPath) ||
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && googleMapsPath);

  if (url.protocol !== "https:" || !allowed) {
    throw new PlaceResolutionError(
      "Only Google Maps URLs are supported",
      "INVALID_MAPS_URL",
      400,
    );
  }

  return url;
}

function mapsPlaceId(url: URL): string | null {
  const queryId =
    url.searchParams.get("query_place_id") ??
    url.searchParams.get("place_id");
  if (queryId?.trim()) return queryId.trim();

  const dataId = decodeURIComponent(url.href).match(/!1s(ChI[^!/?]+)/)?.[1];
  return dataId ?? null;
}

function mapsFallback(url: URL): { name: string; address: string } {
  const segments = url.pathname.split("/").filter(Boolean);
  const placeIndex = segments.indexOf("place");
  const pathName =
    placeIndex >= 0 ? segments[placeIndex + 1]?.replace(/\+/g, " ") : null;
  const queryName = url.searchParams.get("query")?.replace(/\+/g, " ");

  return {
    name: decodeURIComponent(pathName ?? queryName ?? "").trim(),
    address: "",
  };
}

async function expandShortMapsUrl(
  url: URL,
  fetchFn: typeof fetch,
): Promise<URL> {
  if (url.hostname !== "maps.app.goo.gl" && url.hostname !== "goo.gl") {
    return url;
  }

  const response = await fetchFn(url, { method: "HEAD", redirect: "follow" });
  if (!response.ok || !response.url) throw new Error("Maps link failed");
  return mapsUrl(response.url);
}

async function fetchGooglePlace(
  externalPlaceId: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<GooglePlaceCandidate> {
  const response = await fetchFn(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(externalPlaceId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,websiteUri",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Place details failed with ${response.status}`);
  }

  const candidate = googleCandidate(await response.json());
  if (!candidate) throw new Error("Google Place details were incomplete");
  return candidate;
}

function canonicalData(
  candidate: Extract<PlaceCandidate, { source: "google" }> | {
    source?: never;
    name: string;
    address: string;
    area?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    website?: string | null;
  },
): CanonicalPlaceData {
  const name = candidate.name.trim();
  const address = candidate.address.trim();

  if (!name || !address) {
    throw new PlaceResolutionError(
      "Name and address are required",
      "INVALID_INPUT",
      400,
    );
  }

  return {
    name,
    normalizedName: normalizePlaceText(name),
    address,
    normalizedAddress: normalizePlaceText(address),
    area: candidate.area?.trim() || null,
    latitude: candidate.latitude ?? null,
    longitude: candidate.longitude ?? null,
    externalSource: candidate.source === "google" ? "google" : null,
    externalPlaceId:
      candidate.source === "google" ? candidate.externalPlaceId : null,
    website: candidate.website?.trim() || null,
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function createCanonical(
  data: CanonicalPlaceData,
  store: PlaceStore,
): Promise<Place> {
  try {
    return await store.create(data);
  } catch (error) {
    if (
      hasPrismaCode(error, "P2002") &&
      data.externalSource &&
      data.externalPlaceId
    ) {
      const existing = await store.findByExternal(
        data.externalSource,
        data.externalPlaceId,
      );
      if (existing) return existing;
    }
    throw error;
  }
}

export async function searchPlaces(
  query: string,
  dependencies: PlaceDependencies = {},
): Promise<PlaceCandidate[]> {
  const normalizedQuery = normalizePlaceText(query);
  if (!normalizedQuery) return [];

  const store = dependencies.store ?? defaultStore;
  const localPlaces = await store.searchLocal(normalizedQuery);
  const local = localPlaces.map(localCandidate);
  const apiKey = dependencies.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return local;

  let provider: GooglePlaceCandidate[];
  try {
    provider = await searchGoogle(
      query.trim(),
      apiKey,
      dependencies.fetch ?? fetch,
    );
  } catch {
    return local;
  }

  const keys = new Set(
    local.map(
      (candidate) =>
        `${normalizePlaceText(candidate.name)}:${normalizePlaceText(candidate.address)}`,
    ),
  );
  const externalIds = new Set(
    localPlaces.flatMap((place) =>
      place.externalSource === "google" && place.externalPlaceId
        ? [place.externalPlaceId]
        : [],
    ),
  );

  return [
    ...local,
    ...provider.filter((candidate) => {
      if (externalIds.has(candidate.externalPlaceId)) return false;
      const key = `${normalizePlaceText(candidate.name)}:${normalizePlaceText(candidate.address)}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    }),
  ].slice(0, 20);
}

export async function resolvePlace(
  input: PlaceInput,
  dependencies: PlaceDependencies = {},
): Promise<Place> {
  const store = dependencies.store ?? defaultStore;

  if (input.type === "search") {
    if (input.candidate.source === "local") {
      const existing = await store.findById(input.candidate.id);
      if (existing) return existing;
      throw new PlaceResolutionError(
        "Place no longer exists",
        "NOT_FOUND",
        404,
      );
    }

    const existing = await store.findByExternal(
      "google",
      input.candidate.externalPlaceId,
    );
    if (existing) return existing;
    return createCanonical(canonicalData(input.candidate), store);
  }

  if (input.type === "manual") {
    const data = canonicalData(input);
    const existing = await store.findByNormalized(
      data.normalizedName,
      data.normalizedAddress,
    );
    return existing ?? createCanonical(data, store);
  }

  const originalUrl = mapsUrl(input.url);
  const fallback = mapsFallback(originalUrl);
  const apiKey = dependencies.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const expandedUrl = await expandShortMapsUrl(
        originalUrl,
        dependencies.fetch ?? fetch,
      );
      const externalPlaceId = mapsPlaceId(expandedUrl);
      if (externalPlaceId) {
        const existing = await store.findByExternal(
          "google",
          externalPlaceId,
        );
        if (existing) return existing;

        const candidate = await fetchGooglePlace(
          externalPlaceId,
          apiKey,
          dependencies.fetch ?? fetch,
        );
        return createCanonical(canonicalData(candidate), store);
      }
    } catch {
      // Provider failure intentionally falls through to manual confirmation.
    }
  }

  throw new PlaceResolutionError(
    "Confirm this place manually",
    "MANUAL_CONFIRMATION_REQUIRED",
    200,
    fallback,
  );
}

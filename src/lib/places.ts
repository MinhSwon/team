import { createHash } from "node:crypto";

import type { Place, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { PLACE_LIMITS, normalizePlaceText } from "@/lib/validation";

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
  findById(id: string, viewerId?: string): Promise<Place | null>;
  findByExternal(
    externalSource: string,
    externalPlaceId: string,
  ): Promise<Place | null>;
  searchLocal(normalizedQuery: string, viewerId?: string): Promise<Place[]>;
  create(data: CanonicalPlaceData): Promise<Place>;
  upsertManual(
    data: CanonicalPlaceData & { dedupeKey: string },
  ): Promise<Place>;
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

function optionalText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) invalidInput();
  return value;
}

function optionalCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalidInput();
  }
  return value;
}

function optionalWebsite(value: unknown): string | null | undefined {
  const website = optionalText(value, PLACE_LIMITS.website);
  if (website == null || !website.trim()) return website;
  try {
    const url = new URL(website);
    if (url.protocol !== "https:" || url.username || url.password) {
      invalidInput();
    }
    return website;
  } catch {
    return invalidInput();
  }
}

function requiredText(value: unknown, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength
  ) {
    invalidInput();
  }
  return value;
}

export function parsePlaceInput(value: unknown): PlaceInput {
  const input = record(value);
  if (!input || typeof input.type !== "string") invalidInput();

  if (input.type === "mapsUrl") {
    if (
      typeof input.url !== "string" ||
      !input.url.trim() ||
      input.url.length > PLACE_LIMITS.mapsUrl
    ) {
      invalidInput();
    }
    return { type: "mapsUrl", url: input.url };
  }

  if (input.type === "manual") {
    return {
      type: "manual",
      name: requiredText(input.name, PLACE_LIMITS.name),
      address: requiredText(input.address, PLACE_LIMITS.address),
      area: optionalText(input.area, PLACE_LIMITS.area),
      latitude: optionalCoordinate(input.latitude, -90, 90),
      longitude: optionalCoordinate(input.longitude, -180, 180),
      website: optionalWebsite(input.website),
    };
  }

  if (input.type === "search") {
    const candidate = record(input.candidate);
    if (
      !candidate ||
      typeof candidate.source !== "string"
    ) {
      invalidInput();
    }
    const name = requiredText(candidate.name, PLACE_LIMITS.name);
    const address = requiredText(
      candidate.address,
      PLACE_LIMITS.address,
    );

    if (candidate.source === "local") {
      if (typeof candidate.id !== "string" || !candidate.id.trim()) {
        invalidInput();
      }
      return {
        type: "search",
        candidate: {
          source: "local",
          id: candidate.id,
          name,
          address,
          area: optionalText(candidate.area, PLACE_LIMITS.area) ?? null,
          latitude:
            optionalCoordinate(candidate.latitude, -90, 90) ?? null,
          longitude:
            optionalCoordinate(candidate.longitude, -180, 180) ?? null,
          website: optionalWebsite(candidate.website) ?? null,
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
        name,
        address,
        area: optionalText(candidate.area, PLACE_LIMITS.area),
        latitude: optionalCoordinate(candidate.latitude, -90, 90),
        longitude: optionalCoordinate(candidate.longitude, -180, 180),
        website: optionalWebsite(candidate.website),
      },
    };
  }

  return invalidInput();
}

export type PlaceDependencies = {
  store?: PlaceStore;
  fetch?: typeof fetch;
  apiKey?: string;
  viewerId?: string;
};

function visiblePlaceWhere(viewerId: string): Prisma.PlaceWhereInput {
  return {
    OR: [
      {
        externalSource: { not: null },
        externalPlaceId: { not: null },
      },
      {
        savedBy: {
          some: {
            OR: [
              { userId: viewerId },
              {
                user: {
                  requestsSent: {
                    some: {
                      addresseeId: viewerId,
                      status: "ACCEPTED",
                    },
                  },
                },
              },
              {
                user: {
                  requestsIn: {
                    some: {
                      requesterId: viewerId,
                      status: "ACCEPTED",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

const defaultStore: PlaceStore = {
  findById: (id, viewerId) =>
    viewerId
      ? prisma.place.findFirst({
          where: { id, ...visiblePlaceWhere(viewerId) },
        })
      : Promise.resolve(null),
  findByExternal: (externalSource, externalPlaceId) =>
    prisma.place.findUnique({
      where: {
        externalSource_externalPlaceId: {
          externalSource,
          externalPlaceId,
        },
      },
    }),
  searchLocal: (normalizedQuery, viewerId) =>
    viewerId
      ? prisma.place.findMany({
          where: {
            AND: [
              visiblePlaceWhere(viewerId),
              {
                OR: [
                  { normalizedName: { contains: normalizedQuery } },
                  { normalizedAddress: { contains: normalizedQuery } },
                ],
              },
            ],
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 20,
        })
      : Promise.resolve([]),
  create: (data) => prisma.place.create({ data }),
  upsertManual: (data) =>
    prisma.place.upsert({
      where: { dedupeKey: data.dedupeKey },
      update: {},
      create: data,
    }),
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

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function providerWebsite(value: unknown): string | null {
  const website = text(value);
  if (!website || website.length > PLACE_LIMITS.website) return null;
  try {
    const url = new URL(website);
    return url.protocol === "https:" && !url.username && !url.password
      ? website
      : null;
  } catch {
    return null;
  }
}

function googleCandidate(value: unknown): GooglePlaceCandidate | null {
  const item = record(value);
  const displayName = record(item?.displayName);
  const location = record(item?.location);
  const externalPlaceId = text(item?.id);
  const name = text(displayName?.text);
  const address = text(item?.formattedAddress);

  if (
    !externalPlaceId ||
    !name ||
    name.length > PLACE_LIMITS.name ||
    !address ||
    address.length > PLACE_LIMITS.address
  ) {
    return null;
  }

  return {
    source: "google",
    externalPlaceId,
    name,
    address,
    latitude: coordinate(location?.latitude, -90, 90),
    longitude: coordinate(location?.longitude, -180, 180),
    website: providerWebsite(item?.websiteUri),
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
      signal: AbortSignal.timeout(3000),
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
  if (rawUrl.length > PLACE_LIMITS.mapsUrl) {
    throw new PlaceResolutionError(
      "Invalid place input",
      "INVALID_INPUT",
      400,
    );
  }
  let url: URL;
  try {
    decodeURIComponent(rawUrl);
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

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !allowed
  ) {
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

  const response = await fetchFn(url, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(3000),
  });
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
      signal: AbortSignal.timeout(3000),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Place details failed with ${response.status}`);
  }

  const candidate = googleCandidate(await response.json());
  if (
    !candidate ||
    candidate.externalPlaceId !== externalPlaceId
  ) {
    throw new Error("Google Place details were incomplete");
  }
  return candidate;
}

function manualDedupeKey(
  normalizedName: string,
  normalizedAddress: string,
): string {
  const input = `${Buffer.byteLength(normalizedName, "utf8")}:${normalizedName}${normalizedAddress}`;
  // ponytail: MD5 birthday ceiling is 2^64 keys; move to SHA-256/CHAR(64) if collision evidence appears.
  return createHash("md5").update(input, "utf8").digest("hex");
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
  const name = requiredText(candidate.name, PLACE_LIMITS.name).trim();
  const address = requiredText(
    candidate.address,
    PLACE_LIMITS.address,
  ).trim();

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
    dedupeKey:
      candidate.source === "google"
        ? null
        : manualDedupeKey(
            normalizePlaceText(name),
            normalizePlaceText(address),
          ),
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
  if (query.length > PLACE_LIMITS.query) invalidInput();
  const normalizedQuery = normalizePlaceText(query);
  if (!normalizedQuery) return [];

  const store = dependencies.store ?? defaultStore;
  const localPlaces = await store.searchLocal(
    normalizedQuery,
    dependencies.viewerId,
  );
  const manualKeys = new Set<string>();
  const externalKeys = new Set<string>();
  const dedupedLocal = localPlaces.filter((place) => {
    if (place.externalSource && place.externalPlaceId) {
      const key = `${place.externalSource}:${place.externalPlaceId}`;
      if (externalKeys.has(key)) return false;
      externalKeys.add(key);
      return true;
    }

    const key = `${place.normalizedName}:${place.normalizedAddress}`;
    if (manualKeys.has(key)) return false;
    manualKeys.add(key);
    return true;
  });
  const local = dedupedLocal.map(localCandidate);
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

  return [
    ...local,
    ...provider.filter((candidate) => {
      const key = `google:${candidate.externalPlaceId}`;
      if (externalKeys.has(key)) return false;
      externalKeys.add(key);
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
      const existing = await store.findById(
        input.candidate.id,
        dependencies.viewerId,
      );
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

    const apiKey = dependencies.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new PlaceResolutionError(
        "Confirm this place manually",
        "MANUAL_CONFIRMATION_REQUIRED",
        200,
        {
          name: input.candidate.name.trim(),
          address: input.candidate.address.trim(),
        },
      );
    }

    let candidate: GooglePlaceCandidate;
    try {
      candidate = await fetchGooglePlace(
        input.candidate.externalPlaceId,
        apiKey,
        dependencies.fetch ?? fetch,
      );
    } catch {
      throw new PlaceResolutionError(
        "Confirm this place manually",
        "MANUAL_CONFIRMATION_REQUIRED",
        200,
        {
          name: input.candidate.name.trim(),
          address: input.candidate.address.trim(),
        },
      );
    }

    return createCanonical(canonicalData(candidate), store);
  }

  if (input.type === "manual") {
    const data = canonicalData(input);
    if (!data.dedupeKey) invalidInput();
    return store.upsertManual({ ...data, dedupeKey: data.dedupeKey });
  }

  const originalUrl = mapsUrl(input.url);
  const fallback = mapsFallback(originalUrl);
  const apiKey = dependencies.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  let expandedUrl: URL;

  try {
    expandedUrl = await expandShortMapsUrl(
      originalUrl,
      dependencies.fetch ?? fetch,
    );
  } catch (error) {
    if (error instanceof PlaceResolutionError) throw error;
    throw new PlaceResolutionError(
      "Confirm this place manually",
      "MANUAL_CONFIRMATION_REQUIRED",
      200,
      fallback,
    );
  }

  const externalPlaceId = mapsPlaceId(expandedUrl);
  if (externalPlaceId) {
    const existing = await store.findByExternal(
      "google",
      externalPlaceId,
    );
    if (existing) return existing;

    if (apiKey) {
      let candidate: GooglePlaceCandidate;
      try {
        candidate = await fetchGooglePlace(
          externalPlaceId,
          apiKey,
          dependencies.fetch ?? fetch,
        );
      } catch {
        throw new PlaceResolutionError(
          "Confirm this place manually",
          "MANUAL_CONFIRMATION_REQUIRED",
          200,
          fallback,
        );
      }
      return createCanonical(canonicalData(candidate), store);
    }
  }

  throw new PlaceResolutionError(
    "Confirm this place manually",
    "MANUAL_CONFIRMATION_REQUIRED",
    200,
    fallback,
  );
}

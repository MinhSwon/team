import assert from "node:assert/strict";
import test from "node:test";

import type { Place } from "@prisma/client";

import {
  PlaceResolutionError,
  parsePlaceInput,
  resolvePlace,
  searchPlaces,
  type CanonicalPlaceData,
  type PlaceStore,
} from "./places";

const now = new Date("2026-08-08T00:00:00.000Z");

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "place-1",
    name: "Cafe Central",
    normalizedName: "cafe central",
    address: "1 Main Street",
    normalizedAddress: "1 main street",
    area: null,
    latitude: null,
    longitude: null,
    externalSource: null,
    externalPlaceId: null,
    website: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakePlaceStore implements PlaceStore {
  places: Place[];
  creates = 0;

  constructor(places: Place[] = []) {
    this.places = structuredClone(places);
  }

  async findById(id: string) {
    return this.places.find((item) => item.id === id) ?? null;
  }

  async findByExternal(externalSource: string, externalPlaceId: string) {
    return (
      this.places.find(
        (item) =>
          item.externalSource === externalSource &&
          item.externalPlaceId === externalPlaceId,
      ) ?? null
    );
  }

  async findByNormalized(normalizedName: string, normalizedAddress: string) {
    return (
      this.places.find(
        (item) =>
          item.normalizedName === normalizedName &&
          item.normalizedAddress === normalizedAddress,
      ) ?? null
    );
  }

  async searchLocal(normalizedQuery: string) {
    return this.places.filter(
      (item) =>
        item.normalizedName.includes(normalizedQuery) ||
        item.normalizedAddress.includes(normalizedQuery),
    );
  }

  async create(data: CanonicalPlaceData) {
    this.creates += 1;
    const created = place({
      id: `place-${this.places.length + 1}`,
      ...data,
    });
    this.places.push(created);
    return created;
  }
}

test("resolvePlace reuses a place with the same external ID", async () => {
  const existing = place({
    externalSource: "google",
    externalPlaceId: "ChIJ-existing",
  });
  const store = new FakePlaceStore([existing]);

  const resolved = await resolvePlace(
    {
      type: "search",
      candidate: {
        source: "google",
        externalPlaceId: "ChIJ-existing",
        name: "Cafe Central renamed",
        address: "Different provider formatting",
      },
    },
    { store },
  );

  assert.equal(resolved.id, existing.id);
  assert.equal(store.creates, 0);
});

test("resolvePlace reuses a normalized manual duplicate", async () => {
  const existing = place();
  const store = new FakePlaceStore([existing]);

  const resolved = await resolvePlace(
    {
      type: "manual",
      name: "  CAFE   CENTRAL ",
      address: "1 MAIN STREET",
    },
    { store },
  );

  assert.equal(resolved.id, existing.id);
  assert.equal(store.creates, 0);
});

test("resolvePlace returns manual confirmation fields for an unresolved Maps URL", async () => {
  const store = new FakePlaceStore();

  await assert.rejects(
    resolvePlace(
      {
        type: "mapsUrl",
        url: "https://www.google.com/maps/place/Cafe+Central/",
      },
      { store },
    ),
    (error: unknown) => {
      assert.ok(error instanceof PlaceResolutionError);
      assert.equal(error.code, "MANUAL_CONFIRMATION_REQUIRED");
      assert.deepEqual(error.fallback, {
        name: "Cafe Central",
        address: "",
      });
      return true;
    },
  );
  assert.equal(store.creates, 0);
});

test("resolvePlace rejects URLs outside allowed Google Maps hosts", async () => {
  await assert.rejects(
    resolvePlace(
      {
        type: "mapsUrl",
        url: "https://example.com/google.com/maps/place/Cafe",
      },
      { store: new FakePlaceStore() },
    ),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "INVALID_MAPS_URL",
  );

  await assert.rejects(
    resolvePlace(
      {
        type: "mapsUrl",
        url: "https://www.google.com/maps.evil/place/Cafe",
      },
      { store: new FakePlaceStore() },
    ),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "INVALID_MAPS_URL",
  );
});

test("searchPlaces maps Google Text Search results with mocked fetch", async () => {
  let requestedUrl = "";
  const fetchFn: typeof fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({
      places: [
        {
          id: "ChIJ-provider",
          displayName: { text: "Provider Cafe" },
          formattedAddress: "2 Provider Road",
          location: { latitude: 10.77, longitude: 106.7 },
          websiteUri: "https://provider.example",
        },
      ],
    });
  };

  const results = await searchPlaces("provider cafe", {
    apiKey: "test-key",
    fetch: fetchFn,
    store: new FakePlaceStore(),
  });

  assert.equal(
    requestedUrl,
    "https://places.googleapis.com/v1/places:searchText",
  );
  assert.deepEqual(results, [
    {
      source: "google",
      externalPlaceId: "ChIJ-provider",
      name: "Provider Cafe",
      address: "2 Provider Road",
      latitude: 10.77,
      longitude: 106.7,
      website: "https://provider.example",
    },
  ]);
});

test("searchPlaces falls back to local results when provider fails", async () => {
  const local = place({ id: "local-place" });
  const fetchFn: typeof fetch = async () =>
    new Response("provider unavailable", { status: 503 });

  const results = await searchPlaces("Cafe Central", {
    apiKey: "test-key",
    fetch: fetchFn,
    store: new FakePlaceStore([local]),
  });

  assert.deepEqual(results, [
    {
      source: "local",
      id: local.id,
      name: local.name,
      address: local.address,
      area: null,
      latitude: null,
      longitude: null,
      website: null,
    },
  ]);
});

test("searchPlaces merges provider results without duplicating local external IDs", async () => {
  const local = place({
    id: "local-google-place",
    name: "Old Provider Name",
    normalizedName: "old provider name",
    address: "Old provider address",
    normalizedAddress: "old provider address",
    externalSource: "google",
    externalPlaceId: "ChIJ-provider",
  });
  const fetchFn: typeof fetch = async () =>
    Response.json({
      places: [
        {
          id: "ChIJ-provider",
          displayName: { text: "New Provider Name" },
          formattedAddress: "New provider address",
        },
      ],
    });

  const results = await searchPlaces("provider", {
    apiKey: "test-key",
    fetch: fetchFn,
    store: new FakePlaceStore([local]),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.source, "local");
});

test("parsePlaceInput rejects malformed route payloads", () => {
  assert.throws(
    () => parsePlaceInput({ type: "manual", name: "Cafe", address: 42 }),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "INVALID_INPUT",
  );
  assert.throws(
    () =>
      parsePlaceInput({
        type: "search",
        candidate: {
          source: "google",
          externalPlaceId: "",
          name: "Cafe",
          address: "1 Main Street",
        },
      }),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "INVALID_INPUT",
  );
});

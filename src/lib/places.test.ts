import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    dedupeKey: null,
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

  async upsertManual(data: CanonicalPlaceData) {
    const existing = this.places.find(
      (item) => item.dedupeKey === data.dedupeKey,
    );
    return existing ?? this.create(data);
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

test("resolvePlace fetches trusted Google details before creating a search result", async () => {
  const store = new FakePlaceStore();
  let requestedUrl = "";
  const fetchFn: typeof fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({
      id: "ChIJ-trusted",
      displayName: { text: "Trusted Provider Name" },
      formattedAddress: "22 Trusted Road",
      location: { latitude: 10.8, longitude: 106.7 },
      websiteUri: "https://trusted.example",
    });
  };

  const resolved = await resolvePlace(
    {
      type: "search",
      candidate: {
        source: "google",
        externalPlaceId: "ChIJ-trusted",
        name: "Poisoned Client Name",
        address: "Poisoned Client Address",
      },
    },
    { apiKey: "test-key", fetch: fetchFn, store },
  );

  assert.equal(
    requestedUrl,
    "https://places.googleapis.com/v1/places/ChIJ-trusted",
  );
  assert.equal(resolved.name, "Trusted Provider Name");
  assert.equal(resolved.address, "22 Trusted Road");
  assert.equal(resolved.externalPlaceId, "ChIJ-trusted");
  assert.equal(resolved.dedupeKey, null);
});

test("resolvePlace requires manual confirmation when Google details are unavailable", async () => {
  const store = new FakePlaceStore();

  await assert.rejects(
    resolvePlace(
      {
        type: "search",
        candidate: {
          source: "google",
          externalPlaceId: "ChIJ-unverified",
          name: "Client Suggested Name",
          address: "Client Suggested Address",
        },
      },
      { apiKey: "", store },
    ),
    (error: unknown) => {
      assert.ok(error instanceof PlaceResolutionError);
      assert.equal(error.code, "MANUAL_CONFIRMATION_REQUIRED");
      assert.deepEqual(error.fallback, {
        name: "Client Suggested Name",
        address: "Client Suggested Address",
      });
      return true;
    },
  );

  assert.equal(store.creates, 0);
});

test("resolvePlace does not create a Google record when Place Details fails", async () => {
  const store = new FakePlaceStore();
  const fetchFn: typeof fetch = async () =>
    new Response("provider unavailable", { status: 503 });

  await assert.rejects(
    resolvePlace(
      {
        type: "search",
        candidate: {
          source: "google",
          externalPlaceId: "ChIJ-unavailable",
          name: "Client Suggested Name",
          address: "Client Suggested Address",
        },
      },
      { apiKey: "test-key", fetch: fetchFn, store },
    ),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "MANUAL_CONFIRMATION_REQUIRED",
  );

  assert.equal(store.creates, 0);
});

test("resolvePlace reuses a normalized manual duplicate", async () => {
  const store = new FakePlaceStore();
  const existing = await resolvePlace(
    {
      type: "manual",
      name: "Cafe Central",
      address: "1 Main Street",
    },
    { store },
  );

  const resolved = await resolvePlace(
    {
      type: "manual",
      name: "  CAFE   CENTRAL ",
      address: "1 MAIN STREET",
    },
    { store },
  );

  assert.equal(resolved.id, existing.id);
  assert.equal(store.creates, 1);
});

test("resolvePlace atomically reuses concurrent manual duplicates", async () => {
  const store = new FakePlaceStore();
  const input = {
    type: "manual" as const,
    name: "Cafe Central",
    address: "1 Main Street",
  };

  const [first, second] = await Promise.all([
    resolvePlace(input, { store }),
    resolvePlace(input, { store }),
  ]);

  assert.equal(first.id, second.id);
  assert.equal(store.places.length, 1);
  assert.equal(store.creates, 1);
  assert.equal(
    store.places[0]?.dedupeKey,
    "ab0ed6911380036d0fa29f783f449b7a",
  );
});

test("resolvePlace uses the SQL-compatible manual dedupe key", async () => {
  const store = new FakePlaceStore();

  const resolved = await resolvePlace(
    {
      type: "manual",
      name: "Cafe 😀",
      address: "1 Main",
    },
    { store },
  );

  assert.equal(resolved.dedupeKey, "2a65afbee4ba5954c1e36e179ba713bc");
});

test("Place dedupe migration merges legacy duplicates before backfill and uniqueness", () => {
  const migrationLock = new URL(
    "../../prisma/migrations/migration_lock.toml",
    import.meta.url,
  );
  const migration = new URL(
    "../../prisma/migrations/20260808010000_backfill_place_dedupe_key/migration.sql",
    import.meta.url,
  );
  const baseline = new URL(
    "../../prisma/migrations/20260808000000_init/migration.sql",
    import.meta.url,
  );
  const migrationReadme = new URL(
    "../../prisma/migrations/README.md",
    import.meta.url,
  );

  assert.equal(
    existsSync(migrationLock),
    true,
    "Prisma migration lock must exist",
  );
  assert.match(readFileSync(migrationLock, "utf8"), /provider = "postgresql"/);
  assert.equal(existsSync(baseline), true, "baseline migration must exist");
  const baselineSql = readFileSync(baseline, "utf8");
  assert.match(baselineSql, /CREATE TABLE "User"/);
  assert.match(baselineSql, /CREATE TABLE "Place"/);
  assert.match(baselineSql, /CREATE TABLE "Notification"/);
  assert.doesNotMatch(baselineSql, /dedupeKey/);
  assert.equal(
    existsSync(migrationReadme),
    true,
    "existing database baseline instructions must exist",
  );
  const migrationInstructions = readFileSync(migrationReadme, "utf8");
  assert.match(
    migrationInstructions,
    /prisma migrate resolve --applied 20260808000000_init/,
  );
  assert.match(migrationInstructions, /verify.*schema/i);
  assert.equal(existsSync(migration), true, "dedupe migration must exist");
  const sql = readFileSync(migration, "utf8");
  const merge = sql.indexOf('CREATE TEMP TABLE "_manual_place_duplicates"');
  const repoint = sql.indexOf('UPDATE "UserSavedPlace"');
  const removeDuplicates = sql.indexOf('DELETE FROM "Place"');
  const backfill = sql.indexOf('UPDATE "Place"\nSET "dedupeKey"');
  const uniqueIndex = sql.indexOf(
    'CREATE UNIQUE INDEX "Place_dedupeKey_key"',
  );
  const conflictAbort = sql.indexOf(
    "Cannot merge duplicate saved places without deleting posts",
  );
  const placeMetadataAbort = sql.indexOf(
    "Cannot merge duplicate Places with conflicting metadata",
  );
  const savedPlaceMetadataAbort = sql.indexOf(
    "Cannot merge duplicate saved places with conflicting metadata",
  );
  const firstUpdate = sql.indexOf('\nUPDATE "');
  const firstDelete = sql.indexOf('\nDELETE FROM "');
  const firstDestructiveStatement = Math.min(firstUpdate, firstDelete);
  const begin = sql.indexOf("BEGIN;");
  const commit = sql.lastIndexOf("COMMIT;");

  assert.match(sql, /ADD COLUMN "dedupeKey" CHAR\(32\)/);
  assert.match(
    sql,
    /md5\(\s*octet_length\(convert_to\("normalizedName", 'UTF8'\)\)::text\s*\|\|\s*':'\s*\|\|\s*"normalizedName"\s*\|\|\s*"normalizedAddress"\s*\)/,
  );
  assert.match(sql, /server_encoding/);
  assert.match(sql, /WHERE "externalPlaceId" IS NULL/);
  assert.match(sql, /UPDATE "SavedPlaceImage"/);
  assert.match(sql, /UPDATE "Post"/);
  assert.match(sql, /"rating"\s*=\s*metadata\."rating"/);
  assert.match(sql, /"review"\s*=\s*metadata\."review"/);
  assert.match(sql, /"sourcePostId"\s*=\s*metadata\."sourcePostId"/);
  assert.match(sql, /"tags"\s*=\s*metadata\."tags"/);
  assert.match(sql, /array_agg\(\s*"rating"/);
  assert.match(sql, /array_agg\(\s*"review"/);
  assert.match(sql, /array_agg\(\s*"sourcePostId"/);
  assert.match(sql, /SELECT DISTINCT tag/);
  assert.match(sql, /RAISE EXCEPTION[\s\S]*conflicting_post_ids/);
  for (const field of [
    "name",
    "address",
    "area",
    "latitude",
    "longitude",
    "website",
    "externalSource",
  ]) {
    assert.match(
      sql,
      new RegExp(`count\\(DISTINCT place\\."${field}"\\) > 1`),
    );
  }
  for (const field of ["rating", "review", "sourcePostId"]) {
    assert.match(
      sql,
      new RegExp(`count\\(DISTINCT saved_place\\."${field}"\\) > 1`),
    );
  }
  assert.match(
    sql,
    /dedupeKey=%s placeIds=\[%s\] fields=\[%s\]/,
  );
  assert.match(
    sql,
    /dedupeKey=%s userId=%s savedPlaceIds=\[%s\] fields=\[%s\]/,
  );
  assert.match(
    sql,
    /dedupeKey=%s userId=%s savedPlaceIds=\[%s\] postIds=\[%s\]/,
  );
  assert.match(sql, /UPDATE "Place" survivor[\s\S]*"area" = metadata\."area"/);
  assert.match(sql, /"latitude" = metadata\."latitude"/);
  assert.match(sql, /"longitude" = metadata\."longitude"/);
  assert.match(sql, /"website" = metadata\."website"/);
  assert.match(sql, /"externalSource" = metadata\."externalSource"/);
  assert.match(sql, /DELETE FROM "UserSavedPlace"/);
  assert.doesNotMatch(sql, /DELETE FROM "Post"/);
  assert.doesNotMatch(sql, /DELETE FROM "SavedPlaceImage"/);
  assert.match(sql, /"dedupeKey" IS NULL/);
  assert.equal(begin, 0);
  assert.ok(placeMetadataAbort > 0);
  assert.ok(savedPlaceMetadataAbort > 0);
  assert.ok(conflictAbort > 0);
  assert.ok(firstDestructiveStatement > placeMetadataAbort);
  assert.ok(firstDestructiveStatement > savedPlaceMetadataAbort);
  assert.ok(firstDestructiveStatement > conflictAbort);
  assert.ok(merge >= 0);
  assert.ok(repoint > merge);
  assert.ok(removeDuplicates > repoint);
  assert.ok(backfill > removeDuplicates);
  assert.ok(uniqueIndex > backfill);
  assert.ok(commit > uniqueIndex);
});

test("parsePlaceInput enforces exact place name and address limits", () => {
  assert.doesNotThrow(() =>
    parsePlaceInput({
      type: "manual",
      name: "n".repeat(160),
      address: "a".repeat(500),
    }),
  );

  for (const input of [
    {
      type: "manual",
      name: "n".repeat(161),
      address: "Address",
    },
    {
      type: "manual",
      name: "Name",
      address: "a".repeat(501),
    },
    {
      type: "search",
      candidate: {
        source: "google",
        externalPlaceId: "ChIJ-limit",
        name: "n".repeat(161),
        address: "Address",
      },
    },
  ]) {
    assert.throws(
      () => parsePlaceInput(input),
      (error: unknown) =>
        error instanceof PlaceResolutionError &&
        error.code === "INVALID_INPUT",
    );
  }
});

test("searchPlaces rejects queries over 200 characters", async () => {
  await assert.rejects(
    searchPlaces("q".repeat(201), {
      store: new FakePlaceStore(),
    }),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "INVALID_INPUT",
  );
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

test("resolvePlace reuses a Maps external ID without a provider key", async () => {
  const existing = place({
    externalSource: "google",
    externalPlaceId: "ChIJ-keyless",
  });
  const store = new FakePlaceStore([existing]);
  let fetchCalls = 0;
  const fetchFn: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not run");
  };

  for (const parameter of ["query_place_id", "place_id"]) {
    const resolved = await resolvePlace(
      {
        type: "mapsUrl",
        url: `https://www.google.com/maps/search/?api=1&query=Central&${parameter}=ChIJ-keyless`,
      },
      { apiKey: "", fetch: fetchFn, store },
    );
    assert.equal(resolved.id, existing.id);
  }
  assert.equal(fetchCalls, 0);
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

test("resolvePlace treats malformed percent encoding as an invalid Maps URL", async () => {
  await assert.rejects(
    resolvePlace(
      {
        type: "mapsUrl",
        url: "https://www.google.com/maps/place/%E0%A4%A",
      },
      { store: new FakePlaceStore() },
    ),
    (error: unknown) =>
      error instanceof PlaceResolutionError &&
      error.code === "INVALID_MAPS_URL" &&
      error.status === 400,
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

test("searchPlaces drops provider candidates over name or address limits", async () => {
  const fetchFn: typeof fetch = async () =>
    Response.json({
      places: [
        {
          id: "ChIJ-long-name",
          displayName: { text: "n".repeat(161) },
          formattedAddress: "Address",
        },
        {
          id: "ChIJ-long-address",
          displayName: { text: "Name" },
          formattedAddress: "a".repeat(501),
        },
      ],
    });

  const results = await searchPlaces("provider", {
    apiKey: "test-key",
    fetch: fetchFn,
    store: new FakePlaceStore(),
  });

  assert.deepEqual(results, []);
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

test("searchPlaces keeps distinct Google IDs with matching normalized text", async () => {
  const localManual = place();
  const fetchFn: typeof fetch = async () =>
    Response.json({
      places: [
        {
          id: "ChIJ-first",
          displayName: { text: "Cafe Central" },
          formattedAddress: "1 Main Street",
        },
        {
          id: "ChIJ-second",
          displayName: { text: "  CAFE CENTRAL " },
          formattedAddress: "1 MAIN STREET",
        },
      ],
    });

  const results = await searchPlaces("cafe", {
    apiKey: "test-key",
    fetch: fetchFn,
    store: new FakePlaceStore([localManual]),
  });

  assert.deepEqual(
    results.map((candidate) =>
      candidate.source === "google"
        ? candidate.externalPlaceId
        : candidate.id,
    ),
    ["place-1", "ChIJ-first", "ChIJ-second"],
  );
});

test("searchPlaces dedupes only manual local records by normalized text", async () => {
  const store = new FakePlaceStore([
    place({ id: "manual-first" }),
    place({ id: "manual-duplicate" }),
    place({
      id: "google-first",
      externalSource: "google",
      externalPlaceId: "ChIJ-first",
    }),
    place({
      id: "google-second",
      externalSource: "google",
      externalPlaceId: "ChIJ-second",
    }),
  ]);

  const results = await searchPlaces("cafe", { apiKey: "", store });

  assert.deepEqual(
    results.map((candidate) =>
      candidate.source === "local"
        ? candidate.id
        : candidate.externalPlaceId,
    ),
    ["manual-first", "google-first", "google-second"],
  );
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

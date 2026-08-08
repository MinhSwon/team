# Task 4 Report: Canonical Place Resolution And Image Upload

## Status

Implemented canonical place search/resolution, authenticated image upload, and
the unified protected Add Place confirmation flow. No unprotected `/add` page
was created. Save/share persistence remains visibly disabled for Task 5.

## RED / GREEN

1. Place resolver tests first failed because `src/lib/places.ts` did not exist,
   then failed 6/6 against compile-only `Not implemented` functions.
   Implementation passed external ID reuse, normalized manual reuse, Maps URL
   fallback, URL rejection, mocked Google search, and provider failure fallback.
2. Route payload parser test failed because `parsePlaceInput` was absent.
   Runtime discriminated-union validation then passed.
3. Upload tests first failed because the route did not exist, then failed 4/4
   against a `501` shell. Auth-first handling, configuration errors, MIME/size
   validation, and Blob upload then passed.
4. Protected Add page test failed because the page still rendered its
   placeholder. The page now renders `AddPlaceModal`, and the test confirms no
   unprotected duplicate exists.
5. Merge regression failed with 2 results for one Google external ID. Search
   now treats the external ID as authoritative across local/provider results.
6. URL allowlist regression accepted `/maps.evil`. Path matching now requires
   exactly `/maps` or a `/maps/` prefix.

## Verification

- Baseline `npm test`: 23 passed, 0 failed.
- Final `npm test`: 36 passed, 0 failed.
- Task 4 scoped `npx eslint ...`: exit 0.
- `npm run build`: exit 0 after Prisma generation, Next compilation, and
  TypeScript checking; no Google or Blob environment keys were set.
- `npx react-doctor@latest --verbose --scope changed`: no issues found, score
  72/100.
- `git diff --check`: no whitespace errors; Git only reported Windows line
  ending conversion notices.
- Local server: existing workspace server responds `200` at
  `http://localhost:3000/login`.
- Full `npm run lint`: exit 1 from unchanged legacy files scheduled for Task 7:
  `src/app/decide/page.tsx`, `src/app/discover/page.tsx`,
  `src/components/MapView.tsx`, `src/lib/recommendation/engine.ts`, plus legacy
  warnings. Task 4 files lint clean.

## Files

- `src/lib/places.ts`
- `src/lib/places.test.ts`
- `src/app/api/places/search/route.ts`
- `src/app/api/places/resolve/route.ts`
- `src/app/api/uploads/route.ts`
- `src/app/api/uploads/route.test.ts`
- `src/components/AddPlaceModal.tsx`
- `src/app/(app)/add/page.tsx`
- `src/app/(app)/layout.test.ts`
- `.superpowers/sdd/task-4-report.md`

## Self-Review

- Google Maps HTML is never scraped. Short links use redirect-only `HEAD`
  resolution.
- Allowed Maps hosts and path boundaries are exact.
- Missing provider key and provider failures preserve local/manual paths.
- External IDs deduplicate before normalized text matching.
- Upload identity is derived before token/body handling.
- Upload accepts one JPEG/PNG/WebP file, rejects files over 5 MB, and namespaces
  Blob paths by current user.
- Optional image failure does not block confirmation.
- Search, Maps Link, and Manual all reach one confirmation form.
- Confirmation includes rating, review, tags, and optional photos.
- Save/share control is disabled and explicitly reserved for Task 5.
- No `any` was added.

## Concerns

- Full-repo lint remains red from unchanged legacy screens/modules outside Task
  4 ownership.
- Manual normalized duplicates originally had no database unique constraint;
  review fix pass below resolves this race.
- Browser visual automation was unavailable because the installed Browser
  plugin lacks required `scripts/browser-client.mjs`; automated tests, build,
  React diagnostics, and HTTP server smoke check were completed instead.

## Review Fix Pass - 2026-08-08

### Status

Fixed all eight Task 4 review findings. Google external records now require
server-fetched Place Details, Google result identity is deduplicated only by
source and external ID, keyless Maps URLs still resolve local canonical IDs,
manual creation uses a deterministic unique key with atomic Prisma upsert, and
uploads validate JPEG/PNG/WebP bytes before Blob storage.

### RED

1. `npx tsx --test src/lib/places.test.ts`: 14 tests, 8 passed, 6 failed.
   Failures covered poisoned client data, unavailable provider fallback,
   concurrent manual duplicates, keyless external lookup, malformed percent
   encoding, and distinct Google IDs with matching text.
2. `npx tsx --test src/app/api/uploads/route.test.ts`: 9 tests, 6 passed,
   3 failed. Failures covered script bytes declared as PNG, MIME/signature
   mismatch, and Blob `TypeError` misclassified as malformed multipart.
3. Added keyless local-only dedupe regression:
   `npx tsx --test src/lib/places.test.ts`: 15 tests, 14 passed, 1 failed.
4. First `npm run build` after GREEN compilation failed during TypeScript
   checking at `src/lib/places.test.ts:460`; test accessed `id` without
   discriminating `PlaceCandidate`. Test was corrected before final checks.

### GREEN

- `npm test`: exit 0; 49 passed, 0 failed.
- Focused Task 4 lint:
  `npx eslint "src/lib/places.ts" "src/lib/places.test.ts" "src/app/api/places/search/route.ts" "src/app/api/places/resolve/route.ts" "src/app/api/uploads/route.ts" "src/app/api/uploads/route.test.ts" "src/components/AddPlaceModal.tsx" "src/app/(app)/add/page.tsx" "src/app/(app)/layout.test.ts"`:
  exit 0, no output.
- `npx prisma format`: exit 0; schema formatted in 37 ms.
- `npx prisma generate`: exit 0; Prisma Client 7.9.1 generated in 325 ms.
- `npm run build` with `GOOGLE_MAPS_API_KEY` and
  `BLOB_READ_WRITE_TOKEN` explicitly unset: exit 0.

### Files

- `prisma/schema.prisma`
- `src/lib/places.ts`
- `src/lib/places.test.ts`
- `src/app/api/uploads/route.ts`
- `src/app/api/uploads/route.test.ts`
- `.superpowers/sdd/task-4-report.md`

### Self-Review

- Search resolution ignores client Google name/address when creating records;
  only matching server-side Place Details can create external identity.
- Missing key, failed request, non-OK response, incomplete response, or
  mismatched provider ID returns manual confirmation without creating a Google
  record.
- Manual candidate text is only returned as confirmation input; response
  carries no external identity.
- Local `query_place_id` and `place_id` lookup runs without an API key.
- Distinct Google IDs remain distinct even when normalized names and addresses
  match; normalized dedupe only removes manual local duplicates.
- Manual key originally used SHA-256 over normalized name/address. Final fix
  below replaces it with an exactly SQL-compatible deterministic key.
- External places always store `dedupeKey: null`.
- URL percent decoding errors become `INVALID_MAPS_URL` with status 400.
- Upload MIME must match JPEG, PNG, or WebP magic bytes; invalid/script bytes
  never reach Blob storage.
- Multipart parse handling is scoped to `request.formData()`. Blob and auth
  infrastructure failures return 502, while unauthenticated requests remain
  401.
- No `any` added. No unrelated product files changed.

### Concerns

- Existing deployments needed a real migration before concurrent manual
  writes. Final fix below adds that migration.

## Final Migration And Writer Fix - 2026-08-08

### Status

Added deployable PostgreSQL migration for `Place.dedupeKey`, changed
application key generation to exactly match SQL, and routed legacy
`POST /api/places` manual writes through canonical `resolvePlace`.

### RED

1. `npx tsx --test src/lib/places.test.ts src/app/api/places/route.test.ts`:
   19 tests, 16 passed, 3 failed. Failures proved missing migration, SHA-256
   key mismatch, and direct legacy `prisma.place.create`.
2. Transaction regression:
   `npx tsx --test src/lib/places.test.ts`: 18 tests, 17 passed, 1 failed
   because migration lacked explicit `BEGIN`/`COMMIT`.
3. Encoding regression:
   `npx tsx --test src/lib/places.test.ts`: 18 tests, 17 passed, 1 failed
   because SQL used database encoding instead of explicit UTF-8 conversion.
4. Prisma migration package regression:
   `npx tsx --test src/lib/places.test.ts`: 18 tests, 17 passed, 1 failed
   because `prisma/migrations/migration_lock.toml` was absent.

### GREEN

- Focused resolver/writer tests: 19 passed, 0 failed.
- `npm test`: exit 0; 52 passed, 0 failed.
- Focused Task 4 lint including `src/app/api/places/route.ts` and its new
  regression test: exit 0, no output.
- `npx prisma format`: exit 0; schema formatted in 37 ms.
- `npx prisma generate`: exit 0; Prisma Client 7.9.1 generated in 183 ms.
- `npx prisma validate`: exit 0; schema valid.
- `npm run build` with provider/blob keys unset: exit 0.
- `git diff --check`: no whitespace errors; Windows line-ending warnings only.

### Migration

- Adds nullable `Place.dedupeKey`.
- Selects oldest manual/null-external-ID Place as deterministic survivor for
  each normalized name/address pair.
- Repoints non-conflicting `UserSavedPlace` rows.
- Consolidates conflicting saves by moving images and one allowed one-to-one
  Post before deleting duplicate saves and Places.
- Backfills every surviving manual/null-external-ID row with:
  `UTF8 byte length(normalizedName) + ":" + normalizedName + normalizedAddress`.
- Creates `Place_dedupeKey_key` only after duplicate cleanup and backfill.
- Uses explicit transaction so temporary tables, table lock from
  `ALTER TABLE`, cleanup, backfill, and unique index are atomic.

### Files

- `prisma/migrations/20260808010000_backfill_place_dedupe_key/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `src/lib/places.ts`
- `src/lib/places.test.ts`
- `src/app/api/places/route.ts`
- `src/app/api/places/route.test.ts`
- `.superpowers/sdd/task-4-report.md`

### Self-Review

- Node uses `Buffer.byteLength(normalizedName, "utf8")`; PostgreSQL uses
  `octet_length(convert_to("normalizedName", 'UTF8'))`. Unicode regression
  covers a four-byte emoji.
- Length prefix makes concatenated name/address key unambiguous without
  requiring PostgreSQL extensions.
- All active manual Place writers now call `resolvePlace`; remaining direct
  `prisma.place.create` is resolver-owned external Place creation.
- Legacy null-key and duplicate cleanup ordering is pinned by regression test.
- No unrelated product files changed.

### Concern

- `DATABASE_URL` and `psql` were unavailable, so migration was not executed
  against a live PostgreSQL instance. SQL ordering/key equivalence has focused
  regression coverage; Prisma schema validation and production build pass.

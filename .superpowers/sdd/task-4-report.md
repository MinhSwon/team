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

## Final Migration Review Fix - 2026-08-08

### Status

Added a complete pre-dedupe baseline migration and kept the data-preserving
`dedupeKey` migration as the second migration. Manual keys now use a fixed
`CHAR(32)` MD5 with identical Node/PostgreSQL input bytes. Legacy duplicate
cleanup merges saved-place metadata and related records, or aborts with
conflicting saved-place/Post IDs before any user-data mutation.

### RED

1. `npx tsx --test src/lib/places.test.ts src/lib/validation.test.ts src/app/api/places/route.test.ts`:
   29 tests, 22 passed, 7 failed. Failures covered the missing baseline,
   unbounded key, missing name/address/query/review limits, and the legacy
   route accepting oversized fields.
2. Provider boundary regression:
   `npx tsx --test src/lib/places.test.ts`: 21 tests, 20 passed, 1 failed
   because oversized Google provider candidates escaped validation.

### GREEN

- Focused tests:
  `npx tsx --test src/lib/places.test.ts src/lib/validation.test.ts src/app/api/places/route.test.ts`:
  30 passed, 0 failed.
- `npm test`: exit 0; 57 passed, 0 failed.
- Focused Task 4 lint:
  `npx eslint "src/lib/places.ts" "src/lib/places.test.ts" "src/lib/validation.ts" "src/lib/validation.test.ts" "src/app/api/places/route.ts" "src/app/api/places/route.test.ts" "src/app/api/places/search/route.ts" "src/app/api/places/resolve/route.ts" "src/app/api/uploads/route.ts" "src/app/api/uploads/route.test.ts" "src/components/AddPlaceModal.tsx" "src/app/(app)/add/page.tsx" "src/app/(app)/layout.test.ts"`:
  exit 0, no output.
- `npx prisma format`: exit 0; schema formatted in 35 ms.
- `npx prisma generate`: exit 0; Prisma Client 7.9.1 generated in 170 ms.
- `npx prisma validate`: exit 0; schema valid.
- Baseline static check:
  `npx prisma migrate diff --from-empty --to-schema <schema from commit 3473690> --script`:
  exit 0; generated SQL matches
  `20260808000000_init/migration.sql` after newline normalization
  (`BASELINE_DIFF_MATCH`).
- Current schema static check:
  `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`:
  exit 0; output contains `dedupeKey CHAR(32)` and
  `Place_dedupeKey_key` (`CURRENT_EMPTY_DIFF_VALID`, SHA-256
  `49E1B626D5DD43660EF409506D7D5E9A4BEE7502BBF377D07EAEC1FFBD202E17`).
- `npm run build` with `GOOGLE_MAPS_API_KEY` and
  `BLOB_READ_WRITE_TOKEN` explicitly unset: exit 0. Next.js generated all 21
  static pages and completed production optimization.
- `git diff --check`: no whitespace errors; Git reported Windows line-ending
  conversion notices only.

### Migration

- `20260808000000_init` creates the complete social schema from empty and does
  not contain `dedupeKey`.
- `20260808010000_backfill_place_dedupe_key` runs in one transaction, verifies
  UTF-8 server encoding, and adds nullable `CHAR(32)`.
- Duplicate Place and UserSavedPlace survivors are deterministic.
- Each merged field uses the latest non-null value ordered by `updatedAt`,
  `createdAt`, then ID. Tags become a sorted distinct union.
- Every image moves to the surviving saved place. A sole Post moves. More than
  one Post aborts before user-data mutation with survivor and sorted Post IDs.
- Duplicate saves and Places are deleted only after metadata and relationships
  move. The migration never deletes Posts or SavedPlaceImages.
- Remaining manual/null-external-ID Places receive:
  `md5(UTF8 byte length(normalizedName) + ":" + normalizedName + normalizedAddress)`.
  The unique index is created last.
- `prisma/migrations/README.md` documents fresh deployment and the required
  verified-baseline procedure for existing databases.

### Files

- `prisma/migrations/20260808000000_init/migration.sql`
- `prisma/migrations/20260808010000_backfill_place_dedupe_key/migration.sql`
- `prisma/migrations/README.md`
- `prisma/schema.prisma`
- `src/lib/places.ts`
- `src/lib/places.test.ts`
- `src/lib/validation.ts`
- `src/lib/validation.test.ts`
- `src/app/api/places/route.ts`
- `src/app/api/places/route.test.ts`
- `src/app/api/places/search/route.ts`
- `src/components/AddPlaceModal.tsx`
- `.superpowers/sdd/task-4-report.md`

### Self-Review

- Baseline is generated from the exact schema at commit `3473690`, before
  `dedupeKey`; fresh databases no longer depend on an ALTER-only history.
- Existing databases must verify schema parity and mark only the baseline
  applied before deploying the delta. Instructions explicitly state that
  `migrate resolve` does not create or repair schema objects.
- Node uses `Buffer.byteLength(..., "utf8")` and PostgreSQL uses
  `octet_length(convert_to(..., 'UTF8'))`; ASCII and four-byte Unicode test
  vectors pin parity.
- MD5 is non-security dedupe only. A `ponytail:` comment records the theoretical
  collision ceiling and SHA-256/`CHAR(64)` upgrade path.
- Limits are exact: name 160, address 500, query 200, review 2000.
- All active manual Place writers route through `resolvePlace`; resolver-owned
  Prisma create/upsert operations are the only direct Place writes.
- No `any` added. Unrelated product files and untracked SDD files remain
  untouched.

### Concerns

- No PostgreSQL server, shadow database, `DATABASE_URL`, or `psql` is available,
  so the migration chain was not executed against a live database. Static
  verification covers exact baseline generation, current schema diff, SQL
  ordering/data-preservation assertions, Prisma validation, tests, and build.
- Build logs warn that `BETTER_AUTH_SECRET` uses its default value in this local
  environment. Build still exits 0; deployment must set a production secret.

## Final Metadata Conflict Guards - 2026-08-08

### Status

Added transaction preflight guards for conflicting Place and UserSavedPlace
metadata. Every guard completes before the first `UPDATE` or `DELETE`.
Non-conflicting nullable Place metadata is copied to the deterministic survivor;
tags, images, and a sole Post retain the existing lossless merge behavior.

### RED

- `npx tsx --test src/lib/places.test.ts`: exit 1; 21 tests, 20 passed,
  1 failed. The migration regression failed on missing
  `count(DISTINCT place."name") > 1`, proving the existing SQL lacked the
  required Place metadata guard.
- First run after SQL changes: exit 1; 21 tests, 20 passed, 1 failed. All new
  guard assertions passed; the old generic `UPDATE "Place"` selector matched
  the new metadata-preservation update instead of the later dedupe-key
  backfill. The test was narrowed to `SET "dedupeKey"`.

### GREEN

- Focused migration test:
  `npx tsx --test src/lib/places.test.ts`: exit 0; 21 passed, 0 failed.
- `npm test`: exit 0; 57 passed, 0 failed.
- Focused lint:
  `npx eslint "src/lib/places.test.ts"`: exit 0, no output.
- Static guard ordering scan: all true:
  `PLACE_GUARD_BEFORE_UPDATE`,
  `SAVED_GUARD_BEFORE_UPDATE`,
  `POST_GUARD_BEFORE_UPDATE`,
  `ALL_GUARDS_BEFORE_DELETE`,
  `NO_POST_DELETE`, and `NO_IMAGE_DELETE`.
- `npx prisma validate`: exit 0; schema valid.
- Baseline static check:
  `npx prisma migrate diff --from-empty --to-schema <schema from commit 3473690> --script`:
  exit 0; `BASELINE_DIFF_MATCH`.
- Current schema static check:
  `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`:
  exit 0; `CURRENT_EMPTY_DIFF_VALID`, SHA-256
  `49E1B626D5DD43660EF409506D7D5E9A4BEE7502BBF377D07EAEC1FFBD202E17`.
- `npm run build` with `GOOGLE_MAPS_API_KEY` and
  `BLOB_READ_WRITE_TOKEN` explicitly unset: exit 0; all 21 static pages
  generated.

### Migration Behavior

- Place guard aborts on more than one distinct non-null `name`, `address`,
  `area`, `latitude`, `longitude`, `website`, or `externalSource`.
- Place conflict reports include computed `dedupeKey`, sorted Place IDs, and
  conflicting field names.
- Single non-null nullable Place values are copied to the survivor.
  Earliest `createdAt` remains through survivor selection; latest `updatedAt`
  is retained.
- UserSavedPlace guard aborts on more than one distinct non-null `rating`,
  `review`, or `sourcePostId` for the same user and Place dedupe group.
- Saved-place conflict reports include `dedupeKey`, user ID, sorted saved-place
  IDs, and conflicting field names.
- Multiple-Post abort reports now include `dedupeKey`, user ID, sorted
  saved-place IDs, and sorted Post IDs.
- Explicit table locks keep guard results stable until merge completion.
- Tags remain a sorted distinct union. All images move. One Post moves.
  No Post or SavedPlaceImage is deleted.

### Files

- `prisma/migrations/20260808010000_backfill_place_dedupe_key/migration.sql`
- `src/lib/places.test.ts`
- `.superpowers/sdd/task-4-report.md`

### Self-Review

- All conflict checks use `count(DISTINCT ...)`, which ignores null and permits
  identical non-null values as required.
- All three `RAISE EXCEPTION` paths occur before the first data update/delete.
- Place fields excluded from conflict checks are lossless by construction:
  normalized fields define the group, `externalPlaceId` is null by selection,
  `dedupeKey` is newly added, earliest creation time identifies the survivor,
  and latest update time is copied.
- No unrelated product files changed. Existing untracked SDD files remain
  untouched.

### Concerns

- No PostgreSQL server or shadow database is available, so data-path SQL was
  not executed. Static migration assertions, Prisma schema diffs, full tests,
  and production build are green.
- Build retains the existing local default-`BETTER_AUTH_SECRET` warning.

## Saved Place Timestamp Preservation - 2026-08-08

### Status

Duplicate UserSavedPlace merges now preserve the earliest `createdAt` and
latest `updatedAt` across every merged row, independent of which saved-place
row is selected as survivor.

### RED

- `npx tsx --test src/lib/places.test.ts`: exit 1; 21 tests, 20 passed,
  1 failed. The migration regression failed on missing
  `"createdAt" = metadata."createdAt"`, proving survivor timestamps were not
  merged.

### GREEN

- Focused migration test:
  `npx tsx --test src/lib/places.test.ts`: exit 0; 21 passed, 0 failed.
- `npm test`: exit 0; 57 passed, 0 failed.
- Focused lint:
  `npx eslint "src/lib/places.test.ts"`: exit 0, no output.
- Static timestamp scan confirmed:
  `CREATED_AGGREGATE_PRESENT=True`,
  `UPDATED_AGGREGATE_PRESENT=True`,
  `CREATED_ASSIGNMENT_BEFORE_DELETE=True`, and
  `UPDATED_ASSIGNMENT_BEFORE_DELETE=True`.
- `npx prisma validate`: exit 0; schema valid.
- Baseline static check:
  `npx prisma migrate diff --from-empty --to-schema <schema from commit 3473690> --script`:
  exit 0; `BASELINE_DIFF_MATCH`.
- Current schema static check:
  `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`:
  exit 0; `CURRENT_EMPTY_DIFF_VALID`, SHA-256
  `49E1B626D5DD43660EF409506D7D5E9A4BEE7502BBF377D07EAEC1FFBD202E17`.
- `npm run build` with `GOOGLE_MAPS_API_KEY` and
  `BLOB_READ_WRITE_TOKEN` explicitly unset: exit 0; all 21 static pages
  generated.

### Migration

- `_manual_saved_place_metadata` computes
  `min(saved_place."createdAt")` and `max(saved_place."updatedAt")`.
- The survivor UserSavedPlace receives both values in the same metadata update
  as rating, review, sourcePostId, and tags.
- Timestamp assignments occur before duplicate UserSavedPlace deletion.

### Files

- `prisma/migrations/20260808010000_backfill_place_dedupe_key/migration.sql`
- `src/lib/places.test.ts`
- `.superpowers/sdd/task-4-report.md`

### Concerns

- No PostgreSQL server or shadow database is available, so data-path SQL remains
  statically verified rather than executed.
- Build retains the existing local default-`BETTER_AUTH_SECRET` warning.

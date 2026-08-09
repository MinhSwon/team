# Social Place Network Acceptance

Date: 2026-08-09

Status: **COMPLETE**

Application code HEAD tested:
`1cbec8f4db4d855c601a1d26fb0221d38b9be005`
(`fix: harden private media migration and acceptance`)

Fresh production acceptance identities:

- HTTP: build `ZbahTCCDb1jyNliL4gvqz`, commit
  `1cbec8f4db4d855c601a1d26fb0221d38b9be005`, isolated port `52856`
- Browser: build `oqv2ZnHgpo4hIc36ycxUW`, commit
  `1cbec8f4db4d855c601a1d26fb0221d38b9be005`, isolated port `57853`

Both harnesses generated a new production build, started `next start` on an
isolated port, asserted the current Git commit, and removed
`.next-acceptance` afterward.

## Totals

- Migration proofs: **8 PASS, 0 FAIL**
- Applied migrations: **6**, current database up to date
- Blob conversion readiness: **PASS**, no pending or failed rows
- Seed runs: **2**, each verified **3 credential sign-ins**
- Live PostgreSQL race proofs: **2 PASS, 0 FAIL**
- Unit/domain/API tests: **180 PASS, 0 FAIL**
- Lint: **PASS**, no diagnostics
- Production build: **PASS**, build ID `lpN5Bn9IiQ5-9rpRyO-yI`
- React Doctor changed scope: **100/100**, 92 files, no issues
- HTTP/API acceptance: **12 PASS, 0 FAIL**
- Browser acceptance: **14 PASS, 0 FAIL**
- Combined acceptance criteria: **26 PASS, 0 FAIL**

## Database

Exact commands:

```powershell
npm run verify:migrations
npx prisma migrate deploy
npx prisma migrate status
npm run verify:blob-conversion
```

Migration proof:

```text
PASS fresh temporary schema migration
PASS representative legacy schema rejected before social tables with mapped-table preflight
PASS private Blob image backfills exact owner and pending verified conversion
PASS public Blob image enters durable private-copy ledger
PASS unsupported external image aborts before schema or data mutation
PASS prior private Blob states preserve public references
PASS hardening rejects foreign and ambiguous prior Blob states before mutation
PASS Blob readiness rejects surviving public references
```

Current database result:

```text
Datasource "db": PostgreSQL database "placedecide", schema "public" at "127.0.0.1:55432"
6 migrations found in prisma/migrations
No pending migrations to apply.
Database schema is up to date!
Blob private conversion ready: no pending or failed rows
```

Applied migrations:

- `20260808000000_init`
- `20260808010000_backfill_place_dedupe_key`
- `20260809000000_final_fix_wave`
- `20260809010000_private_blob_lifecycle_enum`
- `20260809011000_private_blob_media`
- `20260809012000_private_blob_hardening`

Baseline rollout remains fresh-install-only. Existing social-schema databases
may be baselined only when they match the schema exactly. Mapped legacy tables
abort before social tables are created.

Existing `SavedPlaceImage` ownership derives only through
`UserSavedPlace.userId`. Migration accepts only exact owned hosts configured by
`placedecide.legacy_blob_store_hosts`; arbitrary Vercel tenants and unsupported
external URLs abort before schema or data mutation. Supported legacy rows enter
`PENDING_PRIVATE_COPY`; cleanup validates a 5 MB bound and JPEG/PNG/WebP magic
before private copy and public-source deletion.

Private-media migrations are unreleased feature-branch history. The corrected
`20260809012000_private_blob_hardening` migration validates both `url` and
`sourceUrl` without rewriting conversion state. The current development
database used the explicit guarded checksum repair only after proving zero
`BlobUpload` and zero `SavedPlaceImage` rows.

## Seed

Exact command:

```powershell
$env:ALLOW_DEMO_SEED="1"
npm run seed:demo
npm run seed:demo
```

Both runs exited 0 and printed:

```text
Verified credential sign-ins: 3
```

Demo credentials remain explicit fixtures. Seed execution refuses production
and requires `ALLOW_DEMO_SEED=1`.

## Automated Verification

Exact commands:

```powershell
npm run verify:races
npm test
npm run lint
$env:TRUSTED_PROXY_IPS="127.0.0.1/32"
npm run check:deployment
npm run build
npx react-doctor@latest --verbose --scope changed
```

Actual results:

- `npm run verify:races`: **2 passed, 0 failed**
- `npm test`: **180 passed, 0 failed, 0 skipped**
- `npm run lint`: exit 0, no diagnostics
- `npm run check:deployment`: one valid direct-peer proxy entry
- `npm run build`: Prisma Client `7.9.1`; Next.js `16.3.0`; compile,
  TypeScript, 23-page generation, and route finalization passed
- Standard production build ID: `lpN5Bn9IiQ5-9rpRyO-yI`
- React Doctor: 92 changed-scope files, **100/100**, no issues

An initial production build without `TRUSTED_PROXY_IPS` failed during API route
configuration collection. This is expected fail-fast behavior. The verified
local production build used explicit direct-peer trust
`TRUSTED_PROXY_IPS=127.0.0.1/32`.

Live race output:

```text
PASS PostLike race: serialized before removal
PASS Comment race: serialized before removal
```

## Security Review Coverage

- New uploads use Vercel Blob `access: "private"`.
- HTML and APIs expose stable `/api/media/{uploadId}` URLs only.
- Each media request authenticates and performs one current friendship/place
  visibility query before fetching the private Blob.
- Media responses, including errors, use `Cache-Control: private, no-store`.
  Successful media responses also use `X-Content-Type-Options: nosniff` and a
  stored trusted JPEG/PNG/WebP MIME. Removed friends receive opaque 404 on
  later media requests.
- Legacy conversion requires an exact configured owned Blob hostname and
  ignores provider MIME claims. Payloads over 5 MB or without JPEG, PNG, or
  WebP magic are rejected before private copy.
- Upload reservation is durable before provider write. Ambiguous provider
  `put` failures retain the reservation and deterministic pathname for
  idempotent orphan deletion.
- Blob cleanup claims rows with `FOR UPDATE SKIP LOCKED`, a `DELETING` lease,
  and stale-lease recovery. Provider get/put/delete calls and conversion
  streams have 30-second deadlines under the five-minute lease. Overlapping
  workers cannot process one row.
- Edit/remove/delete atomically moves all referenced active Blob lifecycles to
  `PENDING_DELETE` and clears leases. Lease-guarded conversion completion
  cannot restore a deleted image to `CLAIMED`.
- `npm run verify:blob-conversion` gates `npm run build`, `npm start`, and both
  acceptance harnesses. Readiness fails while private-copy, conversion,
  public-delete, or failed conversion work remains.
- Better Auth uses PostgreSQL-backed `customStorage.consume`; no process-local
  limiter remains. Multi-instance atomic consumption is covered.
- Production startup fails when `TRUSTED_PROXY_IPS` is missing or invalid.
  Proxy IP headers are ignored unless it explicitly lists trusted bare IPs or
  CIDR ranges. Empty list entries, empty prefixes, extra slashes, malformed
  addresses, and out-of-range prefixes are rejected. Development/test disables
  Better Auth IP limiting when no trusted proxy is configured, avoiding a
  shared global bucket.
- `npm run cleanup:rate-limits` prunes expired buckets.
- Profile updates reject non-null avatar values; UI uses initials fallback.
- Better Auth signup trims and validates names to 1-80 characters and forces
  `image: null` before database creation. Public social DTOs omit avatar/image.
- Uploads reject declared multipart requests over 5 MiB plus 256 KiB before
  `formData()`. Platform request-body limits remain required for missing or
  chunked `Content-Length`.
- Legacy conversion claims at most four rows and processes them sequentially.
- Media reads pass a 30-second abort signal to the installed Blob SDK.
- Saved-place image captions are capped at 300 characters server-side.
- Acceptance rejects untracked files outside `.superpowers/sdd`, tolerates
  synchronous teardown failures while completing later cleanup, restores
  environment, removes `.next-acceptance`, and rechecks source commit/state.
- Manual area is limited to 120 characters. Website and Maps URLs are limited
  to 2,048 characters. Website URLs require HTTPS and reject credentials.
  Latitude accepts `[-90, 90]`; longitude accepts `[-180, 180]`.

## HTTP Acceptance

Exact command:

```powershell
npm run acceptance:social
```

Final output:

```text
Fresh production server: build ZbahTCCDb1jyNliL4gvqz, commit 1cbec8f4db4d855c601a1d26fb0221d38b9be005, port 52856
Verified credential sign-ins: 3
Direct auth signup sanitation: PASS
Application: http://127.0.0.1:52856
PASS 1/12 demo users sign in
PASS 2/12 friend request is sent and accepted
PASS 3/12 manual save creates exactly one post
PASS 4/12 search and Maps-link paths save places
PASS 5/12 accepted friend sees all posts
PASS 6/12 nonfriend post GET is opaque 404
PASS 7/12 friend can like, comment, and resave
PASS 8/12 reshare attribution and duplicate save are stable
PASS 9/12 review update changes existing post
PASS 10/12 notifications become read
PASS 11/12 friend removal hides feed, profile, and post
PASS 12/12 reload preserves data
Acceptance total: 12 PASS, 0 FAIL
```

## Browser Acceptance

Exact command:

```powershell
npm run acceptance:browser
```

Final output:

```text
Fresh production server: build oqv2ZnHgpo4hIc36ycxUW, commit 1cbec8f4db4d855c601a1d26fb0221d38b9be005, port 57853
Verified credential sign-ins: 3
PASS 1/14 fresh registration and demo users sign in through UI
PASS 2/14 friend request is sent and accepted through UI
PASS 3/14 manual UI save creates exactly one post
PASS 4/14 search and Maps-link UI paths save places
PASS 5/14 accepted friend sees all posts in UI feed
PASS 6/14 manual privacy and unauthorized APIs are opaque
PASS 7/14 friend likes, comments, and resaves through UI
PASS 8/14 reshare attribution and duplicate UI state are stable
PASS 9/14 saved search filter edit and remove use visible UI
PASS 10/14 notifications render and become read through UI
PASS 11/14 friend removal hides feed, profiles, and post
PASS 12/14 browser reload preserves saved data
PASS 13/14 unsaved detail saves and removes canonical place in UI
PASS 14/14 desktop and 375px mobile layout and keyboard controls pass
Browser: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
Application: http://127.0.0.1:57853
Acceptance total: 14 PASS, 0 FAIL
```

Browser acceptance registers a fresh user through visible UI. At 375px it
samples Feed, Friends, Notifications, Profile, Place Detail, Saved, and Add.
Checks cover horizontal overflow, bottom-navigation clearance, wrapping, and
keyboard activation of primary navigation and form controls.

Page-context fetch remains limited to exact unauthorized API checks where no
visible UI exists.

## TDD Regression Evidence

- Third-wave initial focused RED: **80 passed, 8 failed**.
- Media-specific RED: **19 passed, 1 failed**.
- Migration verifier RED reproduced public-reference loss for
  `CONVERTING` after private copy and `PENDING_PUBLIC_DELETE`.
- Pre-final focused GREEN: **89 passed, 0 failed**.
- Self-review RED for strict empty proxy entries and synchronous cleanup:
  **49 passed, 3 failed**.
- Self-review GREEN: **52 passed, 0 failed**.
- Initial second-review focused suite: **24 passed, 13 failed**.
- Self-review focused RED:
  `npx tsx --import ./scripts/test-env.ts --test src/lib/final-fix-wave.test.ts`
  returned **35 passed, 4 failed** for hostname case normalization,
  pathname-derived access, bare trusted-proxy IP handling, and browser cleanup
  helper extraction.
- Focused GREEN: same command returned **40 passed, 0 failed**.
- Acceptance worker-cap assertion: **0/1 failed**, then **1/1 passed**.
- Browser acceptance exposed sign-in HTTP 429. Root cause was generated IPv6
  values sharing Better Auth's normalized `/64`; focused IP isolation test
  moved from **0/1 failed** to **1/1 passed** by varying the upper `/64`.
- Acceptance cleanup probe initially left `.next-acceptance`; focused cleanup
  test failed, then passed after Windows process-tree termination.
- Live cleanup proof after both final acceptance runs:
  `NEXT_ACCEPTANCE_EXISTS=false`.

## Security And Artifact Scan

Tracked-file scan:

- `TRACKED_FILES=346`
- `ARTIFACT_PATHS=0`
- `PROVIDER_OR_PRIVATE_KEY_SIGNATURES=0`
- `DB_URL_EXAMPLE_FILES=26`
- `UNEXPECTED_DB_URL_FILES=0`
- `UNEXPECTED_ENV_FILES=0`
- no tracked runtime `.env`, log, cookie, HAR, trace, SQLite, database,
  browser-state, `.next`, or test-result artifact
- `.env.example` is the sole expected environment-name match
- no Google API key, Vercel Blob token, private key, or live auth secret
- credential-shaped references are placeholders, dependency skill examples,
  test bootstrap values, or the three documented demo fixtures
- 20 unrelated untracked `.superpowers/sdd/*` files remain preserved

## External-Key Limitations

- `GOOGLE_MAPS_API_KEY` is unset. Google provider success is not claimed.
- `BLOB_READ_WRITE_TOKEN` is unset. Live private Blob upload, proxy, conversion,
  and deletion success is not claimed.
- Local acceptance proves provider fallback and no-image workflows. Automated
  tests mock Blob APIs and prove ownership, authorization, claim races,
  conversion/outbox state, cleanup retry, concurrency, and orphan expiry.
- Staging verification with real scoped Google and Vercel Blob keys remains
  required.

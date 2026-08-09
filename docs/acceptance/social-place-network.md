# Social Place Network Acceptance

Date: 2026-08-09

Status: **COMPLETE**

Application code HEAD tested:
`3db9fa54ecb9c0973f6588b72c3188a7ec7aa6ef`
(`fix saved place update delete blob race`)

Fresh production acceptance identities:

- HTTP: build `a-ghB0YRV6CuOJRjbf7Bg`, commit
  `3db9fa54ecb9c0973f6588b72c3188a7ec7aa6ef`, isolated port `60070`
- Browser: build `lTXA9iLxrkDA5whhO7qAS`, commit
  `3db9fa54ecb9c0973f6588b72c3188a7ec7aa6ef`, isolated port `58309`

Both harnesses generated a new production build, started `next start` on an
isolated port, asserted the current Git commit, and removed
`.next-acceptance` afterward.

## Totals

- Migration proofs: **8 PASS, 0 FAIL**
- Applied migrations: **6**, current database up to date
- Blob conversion readiness: **PASS**, no pending or failed rows
- Seed runs: **2**, each verified **3 credential sign-ins**
- Live PostgreSQL race proofs: **5 PASS, 0 FAIL**
- Unit/domain/API tests: **183 PASS, 0 FAIL**
- Lint: **PASS**, no diagnostics
- Production build: **PASS**, build ID `yOtb7iUqxm8RP2K7rxVFp`
- React Doctor changed scope: **100/100**, 96 files, no issues
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

- `npm run verify:races`: **4 passed, 0 failed**
- `npm test`: **182 passed, 0 failed, 0 skipped**
- `npm run lint`: exit 0, no diagnostics
- `npm run check:deployment`: one valid direct-peer proxy entry
- `npm run build`: Prisma Client `7.9.1`; Next.js `16.3.0`; compile,
  TypeScript, 23-page generation, and route finalization passed
- Standard production build ID: `sb9qysBw99UvHBGuyNAyT`
- React Doctor: 96 changed-scope files, **100/100**, no issues

An initial production build without `TRUSTED_PROXY_IPS` failed during API route
configuration collection. This is expected fail-fast behavior. The verified
local production build used explicit direct-peer trust
`TRUSTED_PROXY_IPS=127.0.0.1/32`.

Live race output:

```text
PASS PostLike race: serialized before removal
PASS Comment race: serialized before removal
PASS Blob conversion/delete race: leased delete intent retained both references for cleanup
PASS Blob claim/delete boundary: atomic delete intent prevents unreferenced CLAIMED conversion
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
- Edit/remove/delete uses one parameterized PostgreSQL `UPDATE` across all
  referenced active Blob lifecycles. It sets `PENDING_DELETE` and uses
  `CASE WHEN lifecycle = 'CONVERTING' THEN leaseUntil ELSE NULL END`, removing
  the prior claim gap while preserving public/private references. A converter
  may durably record the private reference under its matching lease but cannot
  restore the row to `CLAIMED`; cleanup claims it after lease expiry.
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
- Better Auth updates validate only supplied identity fields, trim names,
  normalize usernames, and reject non-null images without clobbering unrelated
  partial updates.
- User search accepts 200 characters and rejects 201 before Prisma executes.
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
Fresh production server: build YIcA7uHmzCJidMs-RCqlw, commit f5958fe7d2eefa00c7953dc4f39764d895bbf8a5, pid 39768, port 53161
Verified credential sign-ins: 3
Direct auth signup sanitation: PASS
Direct auth update sanitation: PASS
Application: http://127.0.0.1:53161
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
Fresh production server: build w6xsIntDf56vcvEJ0oyEE, commit f5958fe7d2eefa00c7953dc4f39764d895bbf8a5, pid 34664, port 49871
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
Application: http://127.0.0.1:49871
Acceptance total: 14 PASS, 0 FAIL
```

Browser acceptance registers a fresh user through visible UI. At 375px it
samples Feed, Friends, Notifications, Profile, Place Detail, Saved, and Add.
Checks cover horizontal overflow, bottom-navigation clearance, wrapping, and
keyboard activation of primary navigation and form controls.

Page-context fetch remains limited to exact unauthorized API checks where no
visible UI exists.

## TDD Regression Evidence

- Atomic-transition focused RED:
  `npx tsx --import ./scripts/test-env.ts --test
  "src/lib/final-fix-wave.test.ts"` returned **46 passed, 1 failed** because
  `markImagesPendingDelete` still used two `updateMany` statements.
- Atomic-transition live RED: `npm run verify:races` kept the first three race
  proofs green, then the exact claim boundary returned
  `{ converted: 1, failed: 0 }`, proving an unreferenced conversion could
  become `CLAIMED`.
- Atomic-transition focused GREEN: the same focused command returned
  **47 passed, 0 failed**.
- Atomic-transition live GREEN: `npm run verify:races` returned
  **4 passed, 0 failed** and cleanup removed both claim-boundary Blob rows.
- Fourth-wave focused RED:
  `npx tsx --import ./scripts/test-env.ts --test
  "src/lib/auth-update.test.ts" "src/app/api/users/search/route.test.ts"
  "src/lib/final-fix-wave.test.ts"` returned **46 passed, 2 failed** because
  `sanitizeAuthUserUpdate` and `handleUserSearch` did not exist.
- Fourth-wave live race RED: `npm run verify:races` retained two passing
  interaction races but failed the Blob interleaving because delete intent
  cleared `leaseUntil`.
- Fourth-wave focused GREEN: the same focused command returned
  **48 passed, 0 failed**.
- Fourth-wave live race GREEN: `npm run verify:races` returned
  **3 passed, 0 failed**.
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

- `TRACKED_FILES=348`
- `ARTIFACT_PATHS=0`
- `PROVIDER_OR_PRIVATE_KEY_SIGNATURES=0`
- `DB_URL_MATCHES=36`
- `UNEXPECTED_DB_URL_MATCHES=0`
- `COOKIE_SIGNATURE_MATCHES=0`
- `UNTRACKED_OUTSIDE_SDD=0`
- no tracked runtime `.env`, log, cookie, HAR, trace, SQLite, database,
  browser-state, `.next`, or test-result artifact
- `.env.example` is the sole expected environment-name match
- no Google API key, Vercel Blob token, private key, or live auth secret
- credential-shaped references are placeholders, dependency skill examples,
  test bootstrap values, or the three documented demo fixtures
- 22 unrelated untracked `.superpowers/sdd/*` files remain preserved

## External-Key Limitations

- `GOOGLE_MAPS_API_KEY` is unset. Google provider success is not claimed.
- `BLOB_READ_WRITE_TOKEN` is unset. Live private Blob upload, proxy, conversion,
  and deletion success is not claimed.
- Local acceptance proves provider fallback and no-image workflows. Automated
  tests mock Blob APIs and prove ownership, authorization, claim races,
  conversion/outbox state, cleanup retry, concurrency, and orphan expiry.
- Staging verification with real scoped Google and Vercel Blob keys remains
  required.

---

## Parent-Locked Saved-Place Delete Race

Date: 2026-08-09

Application source commit:
`3db9fa54ecb9c0973f6588b72c3188a7ec7aa6ef`

### Finding Closed

- Saved-place deletion now locks the owned `UserSavedPlace` row with one
  parameterized `SELECT ... FOR UPDATE` before enumerating image uploads.
- Update and delete therefore share the same lock order:
  `UserSavedPlace`, then referenced `BlobUpload` rows.
- The atomic delete-intent update retains `leaseUntil` for both active
  `CONVERTING` rows and already leased `PENDING_DELETE` rows.
- Missing and unauthorized deletes retain the existing opaque
  `Saved place not found` HTTP 404 behavior.

### TDD Evidence

Recorded RED:

```text
npx tsx --import ./scripts/test-env.ts --test "src/lib/final-fix-wave.test.ts" "src/lib/posts.test.ts"
  71 PASS, 2 FAIL
  Missing owned parent SELECT ... FOR UPDATE before image enumeration.
  PENDING_DELETE lease was not retained.

npm run verify:races
  First 4 races PASS.
  Blob update/delete race FAIL.
  Replacement upload remained CLAIMED and unreferenced.
  Existing leased PENDING_DELETE upload had leaseUntil cleared.
```

Recorded GREEN:

```text
npx tsx --import ./scripts/test-env.ts --test "src/lib/final-fix-wave.test.ts" "src/lib/posts.test.ts"
  73 PASS, 0 FAIL

npm run verify:races
  5 PASS, 0 FAIL
  PASS Blob update/delete race: parent-first locking covers replacement and retains leased delete intent
```

### Full Verification

```text
npm test
  183 PASS, 0 FAIL, 0 skipped
npm run lint
  PASS
TRUSTED_PROXY_IPS=127.0.0.1/32 npm run build
  Build artifacts complete; BUILD_ID yOtb7iUqxm8RP2K7rxVFp
npx react-doctor@latest --verbose --scope changed
  100/100, 96 files, no issues
npm run acceptance:social
  12 PASS, 0 FAIL
  Build a-ghB0YRV6CuOJRjbf7Bg, port 60070
npm run acceptance:browser
  14 PASS, 0 FAIL
  Build lTXA9iLxrkDA5whhO7qAS, port 58309
Combined acceptance
  26 PASS, 0 FAIL
Acceptance source commit
  3db9fa54ecb9c0973f6588b72c3188a7ec7aa6ef
```

Both acceptance harnesses built and started isolated production servers from
the exact source commit. Cleanup removed `.next-acceptance`; no acceptance
server or build process remained.

Final tracked-file scan:

- `TRACKED_FILES=348`
- `ARTIFACT_PATHS=0`
- `PROVIDER_OR_PRIVATE_KEY_SIGNATURES=0`
- `APP_TRACKED_DB_URL_MATCHES=6`
- `APP_UNEXPECTED_DB_URL_MATCHES=0`
- `COOKIE_SIGNATURE_MATCHES=0`
- `UNTRACKED_OUTSIDE_SDD=0`
- `PRESERVED_UNTRACKED_SDD=23`

### External-Key Limitation

`GOOGLE_MAPS_API_KEY` and `BLOB_READ_WRITE_TOKEN` remain unset. Real Google
Places and Vercel Blob success paths still require staging verification.

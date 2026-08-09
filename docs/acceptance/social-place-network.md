# Social Place Network Acceptance

Date: 2026-08-09

Status: **COMPLETE**

Application code HEAD tested:
`41b70b67fe7ce286fc58ca6e07869405811cdf3d`
(`fix: close final social security gaps`)

Fresh production acceptance identities:

- HTTP: build `5Iqn7n_N7h7i2wf1t0iW5`, commit
  `41b70b67fe7ce286fc58ca6e07869405811cdf3d`, isolated port `62356`
- Browser: build `29hflnD3iogEIqxXacZHW`, commit
  `41b70b67fe7ce286fc58ca6e07869405811cdf3d`, isolated port `64827`

Both harnesses generated a new production build, started `next start` on an
isolated port, asserted the current Git commit, and removed
`.next-acceptance` afterward.

## Totals

- Migration proofs: **5 PASS, 0 FAIL**
- Applied migrations: **5**, current database up to date
- Seed runs: **2**, each verified **3 credential sign-ins**
- Live PostgreSQL race proofs: **2 PASS, 0 FAIL**
- Unit/domain/API tests: **154 PASS, 0 FAIL**
- Lint: **PASS**, no diagnostics
- Production build: **PASS**, build ID `JR6meysh1Bi4t-PLYLvbz`
- React Doctor changed scope: **100/100**, 90 files, no issues
- HTTP/API acceptance: **12 PASS, 0 FAIL**
- Browser acceptance: **14 PASS, 0 FAIL**
- Combined acceptance criteria: **26 PASS, 0 FAIL**

## Database

Exact commands:

```powershell
npm run verify:migrations
npx prisma migrate deploy
npx prisma migrate status
```

Migration proof:

```text
PASS fresh temporary schema migration
PASS representative legacy schema rejected before social tables with mapped-table preflight
PASS private Blob image backfills exact owner and claimed lifecycle
PASS public Blob image enters durable private-copy ledger
PASS unsupported external image aborts before schema or data mutation
```

Current database result:

```text
Datasource "db": PostgreSQL database "placedecide", schema "public" at "127.0.0.1:55432"
5 migrations found in prisma/migrations
No pending migrations to apply.
Database schema is up to date!
```

Applied migrations:

- `20260808000000_init`
- `20260808010000_backfill_place_dedupe_key`
- `20260809000000_final_fix_wave`
- `20260809010000_private_blob_lifecycle_enum`
- `20260809011000_private_blob_media`

Baseline rollout remains fresh-install-only. Existing social-schema databases
may be baselined only when they match the schema exactly. Mapped legacy tables
abort before social tables are created.

Existing `SavedPlaceImage` ownership derives only through
`UserSavedPlace.userId`. Supported private Blob rows become `CLAIMED`.
Supported public Blob rows enter `PENDING_PRIVATE_COPY`; cleanup copies them to
private storage before deleting the public source. Unsupported external URLs
abort before schema or data mutation.

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
npm run build
npx react-doctor@latest --verbose --scope changed
```

Actual results:

- `npm run verify:races`: **2 passed, 0 failed**
- `npm test`: **154 passed, 0 failed, 0 skipped**
- `npm run lint`: exit 0, no diagnostics
- `npm run build`: Prisma Client `7.9.1`; Next.js `16.3.0`; compile,
  TypeScript, 23-page generation, and route finalization passed
- Standard production build ID: `JR6meysh1Bi4t-PLYLvbz`
- React Doctor: 90 changed-scope files, **100/100**, no issues

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
  Removed friends receive opaque 404 on later media requests.
- Upload reservation is durable before provider write. Failed persistence plus
  failed immediate deletion remains recoverable through the reserved pathname
  and cleanup lifecycle.
- Blob cleanup claims rows with `FOR UPDATE SKIP LOCKED`, a `DELETING` lease,
  and stale-lease recovery. Overlapping workers cannot process one row.
- Better Auth uses PostgreSQL-backed `customStorage.consume`; no process-local
  limiter remains. Multi-instance atomic consumption is covered.
- Proxy IP headers are ignored unless `TRUSTED_PROXY_IPS` explicitly lists
  trusted proxy addresses or CIDR ranges.
- `npm run cleanup:rate-limits` prunes expired buckets.
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
Fresh production server: build 5Iqn7n_N7h7i2wf1t0iW5, commit 41b70b67fe7ce286fc58ca6e07869405811cdf3d, pid 45372, port 62356
Verified credential sign-ins: 3
Application: http://127.0.0.1:62356
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
Fresh production server: build 29hflnD3iogEIqxXacZHW, commit 41b70b67fe7ce286fc58ca6e07869405811cdf3d, pid 15944, port 64827
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
Application: http://127.0.0.1:64827
Acceptance total: 14 PASS, 0 FAIL
```

Browser acceptance registers a fresh user through visible UI. At 375px it
samples Feed, Friends, Notifications, Profile, Place Detail, Saved, and Add.
Checks cover horizontal overflow, bottom-navigation clearance, wrapping, and
keyboard activation of primary navigation and form controls.

Page-context fetch remains limited to exact unauthorized API checks where no
visible UI exists.

## TDD Regression Evidence

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

- no tracked runtime `.env`, log, cookie, HAR, trace, SQLite, database,
  browser-state, `.next`, or test-result artifact
- `.env.example` is the sole expected environment-name match
- no Google API key, Vercel Blob token, private key, or live auth secret
- credential-shaped references are placeholders, dependency skill examples,
  test bootstrap values, or the three documented demo fixtures
- 18 unrelated untracked `.superpowers/sdd/*` files remain preserved

## External-Key Limitations

- `GOOGLE_MAPS_API_KEY` is unset. Google provider success is not claimed.
- `BLOB_READ_WRITE_TOKEN` is unset. Live private Blob upload, proxy, conversion,
  and deletion success is not claimed.
- Local acceptance proves provider fallback and no-image workflows. Automated
  tests mock Blob APIs and prove ownership, authorization, claim races,
  conversion/outbox state, cleanup retry, concurrency, and orphan expiry.
- Staging verification with real scoped Google and Vercel Blob keys remains
  required.

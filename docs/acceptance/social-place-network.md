# Social Place Network Acceptance

Date: 2026-08-09

Status: **COMPLETE**

Application code HEAD tested:
`557837fd4604e1f769c9e1103ff854234a4345dd`
(`test: isolate acceptance rate-limit buckets`)

Production build ID: `8jBm6NLR61N7cqSfK8CjE`

Local URL: `http://localhost:3000`

## Totals

- Fresh/legacy migration proofs: **2 PASS, 0 FAIL**
- Applied migrations: **3**, database up to date
- Seed runs: **2**, each verified **3 credential sign-ins**
- Live PostgreSQL race proofs: **2 PASS, 0 FAIL**
- Unit/domain/API tests: **139 PASS, 0 FAIL**
- Lint: **PASS**, no diagnostics
- Build: **PASS**, Prisma Client `7.9.1`, Next.js `16.3.0`
- React Doctor changed scope: **100/100**, no issues
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

Actual migration proof:

```text
PASS fresh temporary schema migration
PASS representative legacy schema rejected before social tables with mapped-table preflight
```

Actual current database result:

```text
Datasource "db": PostgreSQL database "placedecide", schema "public" at "127.0.0.1:55432"
3 migrations found in prisma/migrations
No pending migrations to apply.
Database schema is up to date!
```

Applied migrations:

- `20260808000000_init`
- `20260808010000_backfill_place_dedupe_key`
- `20260809000000_final_fix_wave`

The baseline migration checks mapped legacy tables before its first social
table statement. Normal Prisma deployment of an unmanaged nonempty schema may
stop first with `P3005`; direct baseline proof verifies the explicit
`fresh-install-only` mapped-table message and confirms no social table appears.

## Seed

Exact commands:

```powershell
$env:ALLOW_DEMO_SEED="1"
npm run seed:demo
npm run seed:demo
```

Both runs exited 0. Each run recreated only Alice, Bob, and Carol fixtures,
created one accepted Alice/Bob friendship, found three Better Auth credential
accounts, and printed:

```text
Verified credential sign-ins: 3
```

Generated user and friendship IDs changed between runs. Demo seed refuses
production and refuses execution without `ALLOW_DEMO_SEED=1`.

## Automated Verification

Exact commands:

```powershell
npm test
npm run lint
npm run build
npx react-doctor@latest --verbose --scope changed
npm run verify:races
```

Actual results:

- `npm test`: **139 passed, 0 failed, 0 skipped**
- `npm run lint`: exit 0, no diagnostics
- `npm run build`: exit 0
- Prisma Client generation: **PASS**, version `7.9.1`
- Next production build: **PASS**, build ID `8jBm6NLR61N7cqSfK8CjE`
- React Doctor: scanned 83 changed-scope files, **100/100**, no issues
- PostLike race: **PASS**, transaction serialized before removal
- Comment race: **PASS**, transaction serialized before removal

Unit/stateful race tests also force `P2034` retries and prove a retry after
friend removal returns opaque `Post not found` without adding a like, comment,
or notification.

## HTTP Acceptance

Exact command:

```powershell
npm run acceptance:social
```

Actual final output:

```text
Verified credential sign-ins: 3
Application: http://localhost:3000
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

Each run uses a fresh documentation-range IPv6 value in
`x-forwarded-for`, so PostgreSQL-backed IP buckets remain exercised without
leaking state between repeated acceptance runs.

## Browser Acceptance

Exact command:

```powershell
npm run acceptance:browser
```

Actual final output:

```text
Verified credential sign-ins: 3
PASS 1/14 demo users sign in through UI
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
Application: http://localhost:3000
Acceptance total: 14 PASS, 0 FAIL
```

Visible UI controls perform saved-place search, status filtering, edit, remove,
direct detail save, and detail remove. Page-context fetch is limited to exact
unauthorized API assertions where no UI exists.

Desktop and 375px checks assert:

- no horizontal overflow
- mobile bottom navigation does not obscure final content
- navigation labels and long text fit/wrap
- keyboard reaches and activates primary navigation and form controls

## Security And Artifact Scan

Tracked-file scan result:

- no tracked `.env`, log, cookie, HAR, trace, SQLite, database, browser, or
  test-result artifacts
- no Google API key, Vercel Blob token, private key, or live auth secret
- secret-shaped PostgreSQL/auth matches are generic placeholders in skill
  references, `.env.example`, README, design plan, and test bootstrap
- unrelated untracked `.superpowers/sdd/*` files remain preserved

## External-Key Limitations

- `GOOGLE_MAPS_API_KEY` is unset. Google provider success is not claimed.
- `BLOB_READ_WRITE_TOKEN` is unset. Live Blob upload/delete success is not
  claimed.
- Local acceptance proves provider timeout/manual fallback, no-image save
  paths, mocked Blob ownership/claim/cleanup behavior, and retry persistence.
- Staging verification with real Google and Vercel Blob keys remains required.

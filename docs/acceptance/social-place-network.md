# Social Place Network Acceptance

Date: 2026-08-09

Status: **COMPLETE**

Application code HEAD tested:
`b18a7028934834f6ea7970538d3c0a09a5257e69`
(`test: add reproducible social acceptance`)

Local URL: `http://localhost:3000`

Acceptance totals:

- HTTP/API and PostgreSQL: **12 PASS, 0 FAIL**
- Playwright with installed Microsoft Edge: **12 PASS, 0 FAIL**
- Combined criterion runs: **24 PASS, 0 FAIL**

## Environment

Ignored local `.env` verification:

- `DATABASE_URL=postgresql://postgres@127.0.0.1:55432/placedecide?schema=public`
- `BETTER_AUTH_URL=http://localhost:3000`
- `BETTER_AUTH_SECRET` length: 50 characters
- `GOOGLE_MAPS_API_KEY` unset
- `BLOB_READ_WRITE_TOKEN` unset
- `git check-ignore .env`: matched; `.env` is not committed

The dev server was launched hidden from this worktree:

```powershell
node node_modules/next/dist/bin/next dev -p 3000
```

Readiness check:

```powershell
Invoke-WebRequest http://localhost:3000/login
```

Actual result: HTTP 200.

## Database

Exact commands:

```powershell
npx prisma migrate deploy
npx prisma migrate status
```

Actual `migrate deploy` output:

```text
Datasource "db": PostgreSQL database "placedecide", schema "public" at "127.0.0.1:55432"

2 migrations found in prisma/migrations

No pending migrations to apply.
```

Actual `migrate status` output:

```text
Datasource "db": PostgreSQL database "placedecide", schema "public" at "127.0.0.1:55432"

2 migrations found in prisma/migrations

Database schema is up to date!
```

Applied migrations:

- `20260808000000_init`
- `20260808010000_backfill_place_dedupe_key`

No migration was generated or changed for Task 8.

## Deterministic Seed

Exact commands:

```powershell
npm run seed:demo
npm run seed:demo
```

Both runs exited 0. Each run:

- deleted only users matching the three declared demo emails or usernames
- recreated Alice, Bob, and Carol through `auth.api.signUpEmail`
- recreated one accepted Alice/Bob friendship
- found three Better Auth `credential` accounts
- proved all three printed passwords with `auth.api.signInEmail`
- printed `Verified credential sign-ins: 3`

Generated user and friendship IDs differed between runs, proving accounts were
deleted and recreated. Runtime IDs are intentionally not committed.

Deterministic credentials:

| User | Email | Username | Password |
| --- | --- | --- | --- |
| Alice | `alice@placedecide.local` | `demo.alice` | `DemoAlice!2026` |
| Bob | `bob@placedecide.local` | `demo.bob` | `DemoBob!2026` |
| Carol | `carol@placedecide.local` | `demo.carol` | `DemoCarol!2026` |

Both acceptance scripts invoke the seed before each run. They remove only the
demo Alice/Bob friendship to exercise request/accept, and upsert one fixed
external-ID search fixture. They do not delete non-demo users or broad place
ranges.

## Automated Verification

Exact commands:

```powershell
npm test
npm run lint
npm run build
```

Actual results:

- Tests: **115 passed, 0 failed, 0 skipped**
- Lint: **PASS**, exit 0, no diagnostics
- Build: **PASS**, exit 0
- Build static generation: **23/23**
- Prisma Client generation: **PASS**, Prisma `7.9.1`

TOCTOU regression TDD:

```powershell
npx tsx --test src/lib/posts.test.ts
```

- RED: 21 passed, 1 failed; race returned
  `PostError: You cannot view this post`
- GREEN: 22 passed, 0 failed
- Final full suite includes
  `post detail returns not-found when friendship disappears before detail query`

`getPostDetail` now uses one visibility-filtered detail query. Any null result
returns `Post not found` with HTTP 404; no authorize-then-query 403 path remains.

## HTTP Acceptance

Exact command:

```powershell
npm run acceptance:social
```

Actual final output summary:

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

The script uses three independent Better Auth cookie sessions, exact live HTTP
operations, and Prisma assertions for transaction, count, attribution,
visibility, notification, and persistence invariants. It exits nonzero on any
criterion failure.

## Browser Acceptance

Exact command:

```powershell
npm run acceptance:browser
```

Actual final output summary:

```text
Verified credential sign-ins: 3
PASS 1/12 demo users sign in through UI
PASS 2/12 friend request is sent and accepted through UI
PASS 3/12 manual UI save creates exactly one post
PASS 4/12 search and Maps-link UI paths save places
PASS 5/12 accepted friend sees all posts in UI feed
PASS 6/12 nonfriend post GET is opaque 404 in page context
PASS 7/12 friend likes, comments, and resaves through UI
PASS 8/12 duplicate page-context save keeps attribution
PASS 9/12 review page-context update renders in existing post
PASS 10/12 notifications render and become read through UI
PASS 11/12 friend removal hides feed, profiles, and post
PASS 12/12 browser reload preserves saved data
Browser: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
Application: http://localhost:3000
Acceptance total: 12 PASS, 0 FAIL
```

The browser harness uses `playwright-core` only. It detects `CHROME_PATH`,
common Chrome paths, then common Edge paths. No browser binary, trace,
screenshot, cookie, token, or runtime ID is saved.

## Criterion Evidence

| # | Criterion | HTTP | Browser | Runtime evidence |
| --- | --- | --- | --- | --- |
| 1 | Register or sign in users | PASS | PASS | Seed recreated all three users through Better Auth; HTTP sessions and UI logins returned each expected user. |
| 2 | Send and accept friend request | PASS | PASS | `POST /api/friends` returned 201; Bob accepted with `PATCH /api/friends/:id` 200; DB status became `ACCEPTED`. Browser used Friends UI controls. |
| 3 | Manual save creates one feed post | PASS | PASS | Manual save returned 200; DB had exactly one post for saved place. Browser used Manual tab and `Save and share`. |
| 4 | Search and Maps-link entry paths | PASS | PASS | Local search result saved; Maps URL reached `requiresConfirmation: true`, edited manual confirmation saved with zero images. Browser used Search and Maps Link tabs. |
| 5 | Accepted friend sees all posts | PASS | PASS | Bob API feed and rendered feed contained all three Alice posts. |
| 6 | Unrelated user cannot retrieve post | PASS | PASS | Carol `GET /api/posts/:id` returned **404** with `{"error":"Post not found"}`. |
| 7 | Like, comment, and save friend's place | PASS | PASS | Bob like, comment, and save returned 200; DB had one active like, one active comment, and one Bob save. Browser used post-card controls. |
| 8 | Reshare attribution and duplicate save | PASS | PASS | Bob save and post referenced source post; second save returned same save/post; DB retained one Bob save for place. |
| 9 | Review update changes existing post | PASS | PASS | `PATCH /api/saved/:id` returned 200; friend detail/render showed rating 5 and updated review; post count remained one. |
| 10 | Notifications and read state | PASS | PASS | Alice received `FRIEND_ACCEPTED`, `POST_LIKED`, and `POST_COMMENTED`; mark-all-read left zero unread rows. Browser used Notifications UI. |
| 11 | Friendship removal hides access | PASS | PASS | Delete returned 204; Alice-authored posts disappeared from Bob feed; both cross-profile routes returned 404; Bob `GET /api/posts/:id` returned **404** with `{"error":"Post not found"}`; DB friendship count became zero. |
| 12 | Reload preserves data | PASS | PASS | Repeated API feed and browser reload retained saved place, post, rating 5, and updated review; direct DB read matched. |

## External-Key Limitations

- `GOOGLE_MAPS_API_KEY` is absent. Google provider success is not claimed.
  Runtime acceptance proves local search and Maps-link manual fallback.
- `BLOB_READ_WRITE_TOKEN` is absent. Blob upload success is not claimed.
  Runtime acceptance proves required no-image save paths.

All 12 Task 8 criteria passed in both committed harnesses against local
PostgreSQL and application code HEAD shown above.

# Social Place Network Acceptance

Date: 2026-08-08

Status: **COMPLETE**

Required acceptance: **12 PASS, 0 FAIL**

Application HEAD tested:
`03d8de6cc0e5a9f42f388015d21381c51dc67863`
(`fix: hide unauthorized post existence`)

Local URL: `http://localhost:3000`

## Environment

Local ignored `.env`:

- `DATABASE_URL=postgresql://postgres@127.0.0.1:55432/placedecide?schema=public`
- `BETTER_AUTH_URL=http://localhost:3000`
- `BETTER_AUTH_SECRET` set to more than 32 characters
- `GOOGLE_MAPS_API_KEY` unset
- `BLOB_READ_WRITE_TOKEN` unset

`git check-ignore -v .env` confirmed `.env` is ignored. No secret is staged.

## Commands

```powershell
git rev-parse HEAD
git merge-base --is-ancestor 03d8de6 HEAD
npx prisma migrate status
npm run seed:demo
npm run seed:demo
```

The existing server was restarted from current HEAD with hidden
`Start-Process` execution of:

```powershell
node node_modules/next/dist/bin/next dev -p 3000
```

Readiness:

```powershell
Invoke-WebRequest http://localhost:3000/login
```

Result: HTTP 200.

Complete HTTP acceptance ran as:

```powershell
npx tsx -
```

The command received the inline TypeScript harness through standard input. The
harness used three independent Better Auth cookie sessions, sent
`Origin: http://localhost:3000`, exercised every live API workflow, and used
Prisma only for deterministic setup and post-request database assertions.

Final automated verification:

```powershell
npm test
npm run lint
npm run build
npx prisma migrate status
npm run seed:demo
npm run seed:demo
npx prisma migrate status
```

## Database And Seed

Migration state before and after acceptance:

- `20260808000000_init`: applied
- `20260808010000_backfill_place_dedupe_key`: applied
- Prisma result: `Database schema is up to date!`

No migration was generated or changed.

Deterministic demo users:

| User | Email | Username | Password | ID |
| --- | --- | --- | --- | --- |
| Alice | `alice@placedecide.local` | `demo.alice` | `DemoAlice!2026` | `eqmPYNeGBmcvLhaf2T2OeUaEY46oELLI` |
| Bob | `bob@placedecide.local` | `demo.bob` | `DemoBob!2026` | `kdFrmjGc85uymZoSrIIO8HhvxN9E62OW` |

The seed command ran twice before acceptance with friendship
`1dd43b90-6f11-4cda-a7a5-82b75b382b96`.

Acceptance removed that friendship as criterion 11 required. Final seed
restoration then ran twice and returned the same accepted friendship ID:
`5629527a-a110-4682-b62e-66d227c209b6`.

The seed script used `auth.api.signUpEmail`; live assertions found both Better
Auth `credential` accounts and the accepted friendship.

## Automated Verification

- Tests: **113 passed, 0 failed, 0 skipped**
- Lint: **PASS**, exit 0, no diagnostics
- Build: **PASS**, exit 0
- Prisma Client: generated with Prisma `7.9.1`
- Next.js: compiled, type-checked, and generated 23 routes/pages
- Build environment: `.env`

The test run included:

- `post GET returns not-found for a nonfriend`
- `unauthorized post visibility matches missing posts`

These automated checks supplement, but do not replace, the live HTTP evidence
below.

## Live HTTP Acceptance

Before the run, the harness removed only deterministic `Acceptance *` place
records, related notifications, and the Alice/Bob friendship. It did not reset
or change migration history. Carol was registered through Better Auth HTTP on
the original run and signed in through Better Auth HTTP on this rerun.

| # | Criterion | Status | Exact runtime evidence |
| --- | --- | --- | --- |
| 1 | Register or sign in users | PASS | Alice 200, Bob 200, Carol 200. Carol ID `BHuERDda5T8Mp7Zd1qCBfhL9a023n6wT`. |
| 2 | Send and accept friend request | PASS | `POST /api/friends` 201; Bob incoming list contained request; `PATCH /api/friends/4262c4e6-81f9-4158-82c1-7b099a9e5f9f` 200; DB status `ACCEPTED`. |
| 3 | Manual save creates one feed post | PASS | `POST /api/saved` 200; saved place `9abab679-ba76-4f05-8ea2-47bfbf26c303`; post `e3a9b37f-6791-4598-8fd5-0f0e7370165f`; DB post count for save was 1. |
| 4 | Search and Maps-link entry paths | PASS | Search 200 returned local candidate `4fa2672e-5cf2-47e8-9744-914c53ab7dd7`; search save 200 reused canonical place. Maps resolve 200 returned `requiresConfirmation: true`; edited manual confirmation save 200 with no image. |
| 5 | Accepted friend sees all posts | PASS | Bob feed 200 contained all 3 Alice acceptance posts. |
| 6 | Unrelated user cannot retrieve post | PASS | Carol `GET /api/posts/e3a9b37f-6791-4598-8fd5-0f0e7370165f` returned **404** with `{"error":"Post not found"}`. |
| 7 | Like, comment, and save friend's place | PASS | Like 200, comment 200, save 200; DB contained one like and one active comment on source post. |
| 8 | Reshare attribution and duplicate save | PASS | Bob saved place and post both reference source post `e3a9b37f-6791-4598-8fd5-0f0e7370165f`; second save returned same save/post IDs; DB contained one Bob save and one Bob post for place. |
| 9 | Review update changes existing post | PASS | `PATCH /api/saved/9abab679-ba76-4f05-8ea2-47bfbf26c303` 200; friend post GET 200 showed rating 5 and `Updated acceptance review`; DB post count remained 1. |
| 10 | Notifications and read state | PASS | Alice received `POST_COMMENTED`, `POST_LIKED`, and `FRIEND_ACCEPTED`; mark-all-read updated 3; subsequent list had non-null `readAt` for all. |
| 11 | Friendship removal hides feed/profile/post access | PASS | Delete 204; Bob feed contained no Alice-authored posts; cross-profile GETs returned 404; Bob `GET /api/posts/e3a9b37f-6791-4598-8fd5-0f0e7370165f` returned **404** with `{"error":"Post not found"}`; friendship row count was 0. |
| 12 | Reload preserves data | PASS | Repeated Alice feed GET 200 and direct DB read retained saved place `9abab679-ba76-4f05-8ea2-47bfbf26c303`, post `e3a9b37f-6791-4598-8fd5-0f0e7370165f`, rating 5, and updated review. |

Acceptance DB state before final seed restoration:

- Users: 3
- Acceptance places: 3
- Acceptance saved places: 5
- Acceptance posts: 5
- Source-post likes: 1
- Source-post active comments: 1
- Alice/Bob friendship rows after removal: 0

## Browser Acceptance

Browser automation used connected Microsoft Edge against the same live server.

- **PASS**: Alice signed in through `/login`.
- **PASS**: Alice feed rendered 3 persisted posts, updated rating/review, one
  like, one comment, and one reshare.
- **PASS**: browser reload retained all 3 Alice posts and updated review.
- **PASS**: `/add` exposed Search, Maps Link, and Manual tabs.
- **PASS**: Maps Link without Google credentials reached editable
  `Confirm details` with the URL-derived place name and address field.
- **PASS**: after friendship removal, Bob feed rendered 2 Bob-authored posts
  and 0 Alice-authored posts. Existing reshare attribution still displayed
  `via @demo.alice`.
- **PASS**: Bob navigation to `/profile/demo.alice` rendered
  `404: This page could not be found.`
- Browser console: no warnings or errors during checked flows.

## External-Key Limitations

- `GOOGLE_MAPS_API_KEY` is absent. Google provider success was not claimed.
  Local search and Maps-link manual fallback were verified at runtime.
- `BLOB_READ_WRITE_TOKEN` is absent. Blob upload success was not claimed.
  Required no-image saves were verified at runtime.

All locally verifiable Task 8 criteria passed against PostgreSQL and current
application HEAD.

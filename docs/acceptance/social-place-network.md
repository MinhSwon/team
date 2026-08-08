# Social Place Network Acceptance

Date: 2026-08-08

Status: **INCOMPLETE**

Required acceptance: **11 PASS, 1 FAIL**

Local URL: `http://localhost:3000`

## Environment

Local ignored `.env`:

- `DATABASE_URL=postgresql://postgres@127.0.0.1:55432/placedecide?schema=public`
- `BETTER_AUTH_URL=http://localhost:3000`
- `BETTER_AUTH_SECRET` set to more than 32 characters
- `GOOGLE_MAPS_API_KEY` unset
- `BLOB_READ_WRITE_TOKEN` unset

No environment file or secret is staged.

## Database

Commands:

```powershell
npx prisma migrate status
npx prisma migrate deploy
npm run seed:demo
npm run seed:demo
npx prisma migrate status
```

Initial state: two unapplied migrations.

Applied:

- `20260808000000_init`
- `20260808010000_backfill_place_dedupe_key`

Final state: `Database schema is up to date!`

The second seed run printed the same records as the first:

| User | Email | Username | Password | ID |
| --- | --- | --- | --- | --- |
| Alice | `alice@placedecide.local` | `demo.alice` | `DemoAlice!2026` | `eqmPYNeGBmcvLhaf2T2OeUaEY46oELLI` |
| Bob | `bob@placedecide.local` | `demo.bob` | `DemoBob!2026` | `kdFrmjGc85uymZoSrIIO8HhvxN9E62OW` |

Accepted friendship ID on both seed runs:
`77353ba5-21b1-4a81-91bc-6d0dac2e137c`.

The seed script used `auth.api.signUpEmail`. Its live assertions found two
Better Auth `credential` accounts and one accepted friendship.

## Automated Verification

Commands:

```powershell
npm test
npm run lint
npm run build
```

Results:

- Tests: **112 passed, 0 failed, 0 skipped**
- Lint: **PASS**, exit 0, no diagnostics
- Build: **PASS**, exit 0
- Prisma Client: generated with Prisma `7.9.1`
- Next.js: compiled, type-checked, and generated 23 routes/pages
- Build environment: `.env`

## HTTP Acceptance

Command: `npx tsx -` with an inline TypeScript harness using three independent
cookie jars and `Origin: http://localhost:3000`.

The harness used real HTTP routes and checked database records through Prisma.
It reset only deterministic `Acceptance *` place data, related notifications,
and the Alice/Bob friendship before the run. Carol was registered through
Better Auth HTTP, not inserted directly.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Register or sign in users | PASS | Alice sign-in 200, Bob sign-in 200, Carol registration 200. Carol ID `BHuERDda5T8Mp7Zd1qCBfhL9a023n6wT`. |
| 2 | Send and accept friend request | PASS | `POST /api/friends` 201; Bob incoming list contained request; `PATCH /api/friends/bc6e03a0-4ad5-4ed8-b689-54f82491d467` 200; DB status `ACCEPTED`. |
| 3 | Manual save creates one post | PASS | `POST /api/saved` 200; saved place `e4be6c94-a081-43ec-9aec-5b636418db81`; post `8688372d-ef8c-474f-a6f6-33b696d5f08e`; DB post count for save was 1. |
| 4 | Search and Maps-link entry paths | PASS | Local search returned canonical place `8a3b2aac-2258-4589-9dc7-a0bae293e952`; search save 200 and reused its place ID. Maps resolve 200 returned `requiresConfirmation: true`; edited manual confirmation saved 200 with no image. |
| 5 | Accepted friend sees all posts | PASS | Bob feed returned all 3 Alice acceptance posts. |
| 6 | Unrelated user cannot retrieve post URL as 404 | **FAIL** | Carol `GET /api/posts/8688372d-ef8c-474f-a6f6-33b696d5f08e` returned **403** with `{"error":"You cannot view this post"}`. Requirement is 404. |
| 7 | Like, comment, and save friend's place | PASS | Like 200, comment 200, save 200. DB has one like and one active comment on source post. |
| 8 | Reshare attribution and duplicate save | PASS | Bob save and post both use source post `8688372d-ef8c-474f-a6f6-33b696d5f08e`; second save returned same save/post IDs; DB has one Bob save and one Bob post for place. |
| 9 | Review update changes existing post | PASS | `PATCH /api/saved/e4be6c94-a081-43ec-9aec-5b636418db81` 200; friend post read showed rating 5 and `Updated acceptance review`; DB post count remained 1. |
| 10 | Notifications and read state | PASS | Alice received `POST_COMMENTED`, `POST_LIKED`, and `FRIEND_ACCEPTED`; mark-all-read updated 3; subsequent list had non-null `readAt` for all. |
| 11 | Friendship removal hides feed/profile | PASS | Delete 204; Bob feed contained no Alice posts; both cross-profile requests returned 404; friendship row count became 0. Post read also lost access, but returned 403 as noted in criterion 6. |
| 12 | Reload preserves data | PASS | Repeated feed request and direct DB read retained saved place, same post ID, rating 5, and updated review. |

Final acceptance DB evidence:

- Users: 3
- Acceptance places: 3
- Acceptance saved places: 5
- Acceptance posts: 5
- Source-post likes: 1
- Source-post active comments: 1
- Alice/Bob friendships after removal: 0

After acceptance, `npm run seed:demo` ran twice again to restore demo-ready
state. Both runs returned accepted friendship
`1dd43b90-6f11-4cda-a7a5-82b75b382b96`; the final local database therefore
contains one accepted Alice/Bob friendship.

## Browser Acceptance

Browser: connected Microsoft Edge through browser automation.

- **PASS**: signed in as Alice through `/login`.
- **PASS**: `/feed` rendered 3 persisted Alice posts, including updated rating,
  review, one like, one comment, and one reshare.
- **PASS**: browser reload retained the same 3 posts and updated review.
- **PASS**: `/add` exposed Search, Maps Link, and Manual tabs.
- **PASS**: Maps Link without Google credentials reached `Confirm details`
  with editable name/address fields.
- **PASS**: Manual tab exposed required name/address confirmation fields.
- **LIMITATION**: Edge blocked direct navigation to the JSON post API with
  `ERR_BLOCKED_BY_CLIENT`. The same Carol request was executed with a real HTTP
  cookie session and produced the recorded 403 response.

## External Services

- Google provider success was not tested because `GOOGLE_MAPS_API_KEY` is
  absent. Local search and Maps-link manual fallback were verified.
- Blob upload success was not tested because `BLOB_READ_WRITE_TOKEN` is
  absent. All saves used the required supported no-image path.

## Blocker

Task 8 cannot be marked complete while private post detail exposes a 403.
`GET /api/posts/:id` must return 404 for unauthorized viewers, then criterion 6
and the full acceptance run must be repeated.

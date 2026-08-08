# Task 5 Report: Transactional Save, Post, Feed, And Place Detail

## Status

Implemented Task 5 in protected route-group paths. Saves resolve one canonical
place, create one saved place and one post atomically, recover duplicate and
concurrent saves idempotently, expose friend-only feed/post/detail reads, and
wire Add Place to `/api/saved`. No unprotected page duplicates were created.

## RED / GREEN

### RED

1. `npx tsx --test src/lib/posts.test.ts`
   - Exit 1: `Cannot find module './posts'`.
   - Proved Task 5 save/feed implementation was absent before production code.
2. After core save/feed GREEN, the expanded focused suite ran 12 tests.
   - Exit 1: 10 passed, 2 failed.
   - Failures were missing `getPlaceDetail` and missing protected
     `src/app/(app)/places/[id]/page.tsx`.

### GREEN

- `npx tsx --test src/lib/posts.test.ts`
  - Exit 0: 12 tests, 12 passed.
- Covered one post per save, repeated and concurrent idempotency, source-post
  attribution, update without another post, rollback, narrow Prisma unique
  recovery, accepted-friend feed, removed-friend exclusion, stable
  `(createdAt, id)` pagination, friend-only place reviews, Task 4 limits,
  protected paths, and Add submission wiring.
- Fake persistence uses copy-on-write state, transaction rollback, unique
  checks at commit, and a two-transaction barrier. Tests do not use stateless
  call-count mocks.

## Verification

- `npm test`
  - Exit 0: 69 tests, 69 passed.
- `npx tsc --noEmit`
  - Exit 0.
- Task 5 scoped ESLint command
  - Exit 0, no warnings or errors.
- `npm run build`
  - Exit 0; Prisma generation and Next.js production build completed.
- `npm run lint`
  - Exit 1: 13 errors and 4 warnings, all in unchanged legacy files:
    `src/app/decide/page.tsx`, `src/app/discover/page.tsx`,
    `src/components/MapView.tsx`, `src/lib/recommendation/engine.ts`,
    `src/app/api/imports/route.ts`, and `src/app/import/page.tsx`.
- `npx react-doctor@latest --verbose --scope changed`
  - Exit 0, score 89/100.
  - Two warnings: unchanged upload signature comparison and the pre-existing
    large `AddPlaceModal` component.
- `git diff --check`
  - No whitespace errors; Windows line-ending warnings only.

## Files

Created:

- `src/lib/posts.ts`
- `src/lib/posts.test.ts`
- `src/app/api/saved/route.ts`
- `src/app/api/saved/[id]/route.ts`
- `src/app/api/feed/route.ts`
- `src/app/api/posts/[id]/route.ts`
- `src/app/(app)/places/[id]/page.tsx`
- `src/components/PostCard.tsx`
- `.superpowers/sdd/task-5-report.md`

Modified:

- `src/app/(app)/feed/page.tsx`
- `src/app/(app)/saved/page.tsx`
- `src/components/PlaceCard.tsx`
- `src/components/AddPlaceModal.tsx`

Already compliant, unchanged:

- `src/app/page.tsx` redirects `/` to `/feed`.
- `src/app/(app)/add/page.tsx` hosts the unified Add Place form.

## Self-Review

- Every route and server screen derives identity with `requireCurrentUser`;
  request bodies cannot establish user identity.
- Canonical resolution completes before the save/post transaction.
- Saved place, nested images, and post share one Prisma transaction.
- `(userId, placeId)` and `savedPlaceId` uniqueness create no per-friend post
  copies.
- `P2002` recovery returns only a matching existing save with its post; missing
  matches and arbitrary errors are rethrown.
- Source attribution requires post visibility and the same canonical place.
- PATCH and DELETE check saved-place ownership inside a transaction; update
  leaves the original post intact and delete relies on schema cascades.
- Feed and post detail recheck accepted friendship relations in Prisma queries.
- Feed ordering and cursor predicates both use `createdAt DESC, id DESC`.
- Place detail returns the current user's save and accepted-friend reviews
  only; pending, rejected, removed, and unrelated users are excluded.
- Saved and feed screens read only database-backed Task 5 queries. Active Task
  5 screens contain no mock fallback.
- Protected route-group paths exist with no unprotected duplicates.
- No schema or migration change was needed; Tasks 1-4 already supplied required
  uniqueness and cascade constraints.

## Concerns

- No live PostgreSQL service was used for tests. Stateful transaction tests
  model rollback and concurrent commit conflicts; production Prisma code was
  typechecked and built.
- Full-repo lint remains blocked by unchanged legacy files outside Task 5.
- Task 5 specifies no protected post page, so Add success navigates both new
  and duplicate saves to canonical `/places/:placeId` detail.
- Interactive like, comment, and resave controls remain Task 6 work; Task 5
  cards render counts and saved state without mock mutations.

## Commit

Commit message: `feat: share saved places in friend feed`

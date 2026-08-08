# Task 3 Report: Friendship Domain And Authorization

## Status

Implemented friendship domain, authorization helpers, transactional
notifications, protected API routes, user search, and Friends screen.

## RED

1. `friendPairKey` test failed with `Cannot find module './friendships'`.
2. Eight lifecycle tests failed because friendship mutation and authorization
   functions did not exist.
3. Missing-addressee test failed because raw Prisma-style `P2003` escaped
   instead of becoming a 404 domain error.

Tests covered:

- Deterministic unordered pair keys.
- Self-request rejection.
- Duplicate unordered request rejection.
- Addressee-only acceptance and rejection.
- Mutual friendship after acceptance.
- Participant-only accepted friendship removal.
- Visibility before and after acceptance.
- Request and acceptance notification transaction rollback.
- Missing addressee handling.

## GREEN

- Added stateful fake persistence. Tests assert stored friendship,
  notification, status, rollback, and visibility behavior instead of call
  counts.
- Added Prisma persistence adapter with interactive transactions.
- `FRIEND_REQUEST` creation shares transaction with friendship creation.
- `FRIEND_ACCEPTED` creation shares transaction with acceptance.
- Added protected list, mutation, and search routes.
- Replaced protected Friends placeholder and removed legacy Groups page.
- Split server page from interactive client to load initial data on server and
  avoid client fetch-on-mount.

## Commands And Results

```text
npm test -- --test-name-pattern="friendPairKey"
RED: failed, missing friendships module
GREEN: passed

npm test -- --test-name-pattern="requestFriendship|addressee|participants|visibility|notification failure"
RED: 8 failed, missing domain functions
GREEN: passed

npm test -- --test-name-pattern="missing addressee"
RED: failed, raw P2003 escaped
GREEN: passed

npx next typegen
PASS

npx tsc --noEmit
PASS

npx eslint <Task 3 touched files>
PASS

npx react-doctor@latest --verbose --scope changed
Initial: 68/100, one fetch-in-effect warning in Friends page
Final: 71/100, no issues found

npm test
PASS: 22 tests, 0 failures

npm run lint
EXPECTED LEGACY FAILURE: 13 errors and 6 warnings outside Task 3 touched files

npm run build
PASS: BUILD_EXIT=0, all Task 3 routes generated

npm run dev -- -p 3000
PASS: /login returned 200; anonymous /friends returned 307 to /login
PASS: fresh anonymous probe wrote no UnauthorizedError to stderr
```

Full lint debt remains in legacy Task 7 files including `src/app/decide`,
`src/app/discover`, `src/components/MapView.tsx`, and
`src/lib/recommendation/engine.ts`.

## Files

- Created `src/lib/friendships.ts`.
- Created `src/lib/friendships.test.ts`.
- Created `src/app/api/friends/route.ts`.
- Created `src/app/api/friends/[id]/route.ts`.
- Created `src/app/api/users/search/route.ts`.
- Created `src/app/(app)/friends/FriendsClient.tsx`.
- Replaced `src/app/(app)/friends/page.tsx`.
- Removed `src/app/groups/page.tsx`.

## Self-Review

- Every route and protected page derives identity from `requireCurrentUser`.
- Request body never supplies requester/current-user identity.
- Pair uniqueness relies on schema `pairKey` unique constraint and maps
  duplicate writes to HTTP 409.
- Response authorization permits only addressee; removal permits only either
  accepted friendship participant.
- Post visibility permits author or accepted friend and rejects deleted posts.
- Search excludes current user, never selects email, and limits output to 20.
- Friends UI has one search input, incoming/outgoing/accepted lists, inline
  errors, accessible icon actions, and refreshes only affected client lists.
- Diff leaves unrelated work and untracked SDD briefs unchanged.

## Concerns

- No test database was available. Domain behavior uses stateful fake
  persistence; production Prisma integration is covered by typecheck and
  production build, not live database execution.
- Build emits existing Better Auth warnings for unset `BETTER_AUTH_URL` and
  default `BETTER_AUTH_SECRET`.
- Legacy `src/app/api/groups/route.ts` remains intentionally for Task 7;
  active Groups page was removed as required.

## Review Fix: Atomic Friendship Responses

### RED

Added a barrier-based stateful persistence test where two transactions both
read the same pending request before either attempts its transition.

Cases:

- Competing `accept` and `accept`.
- Competing `accept` and `reject`.

Initial result:

```text
npm test -- --test-name-pattern="competing responses"
FAIL: expected 1 fulfilled response, received 2
```

This reproduced the stale read plus unconditional update race and duplicate
acceptance notification risk.

### GREEN

- Replaced unconditional friendship status update with a conditional
  transition containing `id`, `addresseeId`, and `status: PENDING`.
- Prisma uses `updateMany`; zero affected rows returns `INVALID_STATE`.
- `FRIEND_ACCEPTED` is created only after the conditional accept wins and
  remains inside the same transaction.
- Fake persistence now uses atomic compare-and-set behavior and
  transaction-local undo operations. Competing transactions are not globally
  serialized and a losing transaction cannot restore the winner's state.
- Friends UI now separates search state from a global friendship mutation
  state. All send, accept, reject, and remove controls disable while any
  friendship mutation is active; mutation handlers also reject overlap.
- Inline API errors remain unchanged.

### Verification

```text
npm test -- --test-name-pattern="competing responses"
PASS

npm test
PASS: 23 tests, 0 failures

npx eslint 'src/lib/friendships.ts' 'src/lib/friendships.test.ts' 'src/app/(app)/friends/FriendsClient.tsx'
PASS

npx tsc --noEmit
PASS

npx react-doctor@latest --verbose --scope changed
PASS: 71/100, no issues found

npm run build
PASS: BUILD_EXIT=0
```

Build continues to emit the existing Better Auth environment warnings listed
above.

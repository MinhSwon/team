# Task 6 Report: Likes, Comments, Resaves, And Notifications

## Status

Implemented authenticated likes, comments, resaves, notification listing/read
state, interactive post controls, and the existing protected notifications
page. No unprotected notification page was created.

## RED / GREEN

### RED

1. `npx tsx --test src/lib/interactions.test.ts`
   - Failed with `Cannot find module './interactions'`.
   - Proved the interaction domain was absent before production code.
2. Expanded route-boundary suite.
   - Failed with `Cannot find module '../app/api/notifications/route'`.
   - Proved Task 6 routes did not exist before route implementation.
3. `npx tsx --test --test-name-pattern "reshare rechecks friendship" src/lib/posts.test.ts`
   - Failed after the source visibility callback received no transaction store
     and fell through to live Prisma.
   - Proved resave authorization happened before, not inside, the save
     transaction.
4. `npx tsx --test --test-name-pattern "PostCard renders" src/lib/interactions.test.ts`
   - Failed because `PostCard` rendered passive spans, no interaction buttons,
     and no inline comments.
5. `npx tsx --test --test-name-pattern "concurrent duplicate unlikes" src/lib/interactions.test.ts`
   - Failed with raw Prisma-style `{ code: "P2025" }`.
   - Proved concurrent duplicate unlike recovery was missing.

### GREEN

- `npx tsx --test src/lib/interactions.test.ts`
  - Exit 0: 14 tests, 14 passed.
- Focused reshare tests
  - Exit 0: repeated/concurrent save, attribution, and transaction-time
    friendship recheck passed.
- Tests cover nonfriend 404 behavior, transaction-time visibility, sequential
  like toggle, concurrent duplicate likes/unlikes, comment trimming and
  1,000-character boundary, self-notification suppression, notification
  rollback, duplicate/concurrent resaves, newest-50 notification reads,
  recipient-only read mutation, server-session identity, and interactive
  `PostCard` rendering.
- Stateful fake persistence uses copy-on-write transactions, commit-time
  uniqueness conflicts, transaction barriers, friendship removal hooks,
  notification rollback, stored resaves, and stored read timestamps.

## Verification

- `npm test`
  - Exit 0: 93 tests, 93 passed.
- `npm run lint`
  - Exit 1: 13 errors and 4 warnings, all in unchanged Task 7 legacy files:
    `src/app/decide/page.tsx`, `src/app/discover/page.tsx`,
    `src/components/MapView.tsx`, `src/lib/recommendation/engine.ts`,
    `src/app/api/imports/route.ts`, and `src/app/import/page.tsx`.
- Task 6 scoped ESLint command
  - Exit 0, no warnings or errors.
- `npx tsc --noEmit`
  - Exit 0.
- `npm run build`
  - Exit 0; Prisma generation and Next.js production build completed.
  - New API routes and protected `/notifications` were generated.
  - Existing Better Auth warnings remain for unset `BETTER_AUTH_URL` and
    default `BETTER_AUTH_SECRET`.
- `npx react-doctor@latest --verbose --scope changed`
  - Exit 0, score 86/100.
  - Two pre-existing performance warnings remain in upload signature
    comparison and place-result filtering.
- `git diff --check`
  - Exit 0; Windows line-ending notices only.

## Files

Created:

- `src/lib/interactions.ts`
- `src/lib/interactions.test.ts`
- `src/app/api/posts/[id]/like/route.ts`
- `src/app/api/posts/[id]/comments/route.ts`
- `src/app/api/posts/[id]/save/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/notifications/read/route.ts`
- `.superpowers/sdd/task-6-report.md`

Modified:

- `src/lib/friendships.ts`
- `src/lib/posts.ts`
- `src/lib/posts.test.ts`
- `src/components/PostCard.tsx`
- `src/app/(app)/notifications/page.tsx`

## Self-Review

- Every route derives actor or recipient identity from `requireCurrentUser`;
  client-provided user IDs are ignored.
- Like and comment visibility checks run inside the same transaction as their
  mutation and notification.
- Resaves call `saveAndSharePlace` with `sourcePostId`; source visibility and
  place matching now run inside the save transaction.
- Interaction authorization maps missing, deleted, removed-friend, and
  stranger posts to HTTP 404.
- Like/comment notifications are skipped for self-actions and roll back with
  failed mutations.
- Unique likes and saved places recover concurrent duplicate writes without
  duplicate records, posts, or notifications.
- Comments trim server-side, reject empty/non-text/over-1,000 bodies, and
  return authoritative counts.
- Notification listing returns newest 50 with actor and post/comment
  references. Read updates include `recipientId` in the database predicate.
- `PostCard` changes counts only from successful API responses. Synchronous
  refs block duplicate requests before React rerenders; buttons also expose
  disabled pending states.
- Existing comments render inline. Feed payload embeds the latest three while
  the count remains complete.
- Only `src/app/(app)/notifications/page.tsx` exists for notifications; route
  protection remains inherited from the protected layout.
- No schema or migration change was needed because Task 1 already supplied
  interaction tables, uniqueness, relations, and indexes.

## Concerns

- No live PostgreSQL service was used. Stateful tests model rollback,
  concurrent uniqueness conflicts, removed friendships, and recipient
  scoping; production Prisma queries were typechecked and built.
- Full-repo lint remains blocked by unchanged files scheduled for Task 7.
- Deployment must set `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` to remove
  existing build warnings.

## Commit

Commit message: `feat: add social interactions and notifications`

---

## Review Fixes

### Status

Fixed desired-state like replay behavior, active interaction counts, duplicate
client submissions, and refreshed comment deduplication.

### RED

1. `npx tsx --test src/lib/interactions.test.ts`
   - Exit 1: 15 tests, 6 passed, 9 failed.
   - Explicit `liked` arguments were treated as persistence objects, proving
     the mutation still used toggle semantics.
   - Like route returned HTTP 500 for the new request shape and invalid
     desired-state payloads.
2. `npx tsx --test src/lib/post-card-state.test.ts`
   - Exit 1: `Cannot find module './post-card-state'`.
   - Proved exclusive action, authoritative count, and comment merge helpers
     did not exist.
3. `npx tsx --test --test-name-pattern "feed and post counts stay aligned" src/lib/posts.test.ts`
   - Exit 1: 1 test, 0 passed, 1 failed.
   - Feed returned `{ comments: 0, reshares: 0 }` for one active comment and
     one active reshare.

### GREEN

1. `npx tsx --test src/lib/interactions.test.ts`
   - Exit 0: 15 tests, 15 passed.
2. `npx tsx --test src/lib/post-card-state.test.ts`
   - Exit 0: 4 tests, 4 passed.
3. `npx tsx --test --test-name-pattern "feed and post counts stay aligned" src/lib/posts.test.ts`
   - Exit 0: 1 test, 1 passed.

Coverage now proves replayed and concurrent desired-state likes converge,
duplicate requests create one notification, absent unlikes stay unchanged,
invalid like payloads stop at the route, failed client actions release their
lock without changing prior state, server counts replace local counts, and
refreshed/local comments merge once by ID.

### Verification

- `npm test`
  - Exit 0: 99 tests, 99 passed.
- `npx eslint src/lib/interactions.ts src/lib/interactions.test.ts src/lib/post-card-state.ts src/lib/post-card-state.test.ts src/lib/posts.ts src/lib/posts.test.ts src/components/PostCard.tsx 'src/app/api/posts/[id]/like/route.ts'`
  - Exit 0: no warnings or errors.
- `npm run build`
  - Exit 0: Prisma generation, TypeScript, and Next.js production build
    completed.
- `npx react-doctor@latest --verbose --scope changed`
  - Exit 0: score 76/100, 4 warnings.
  - Existing warnings remain in `src/app/api/uploads/route.ts:42` and
    `src/lib/posts.ts:215`.
  - `src/lib/interactions.ts:300` and `src/lib/interactions.ts:356` report
    sequential awaits; these intentionally keep visibility authorization
    before interaction reads or writes.
- `git diff --check`
  - Exit 0; line-ending notices only.

### Files

Created:

- `src/lib/post-card-state.ts`
- `src/lib/post-card-state.test.ts`

Modified:

- `src/app/api/posts/[id]/like/route.ts`
- `src/components/PostCard.tsx`
- `src/lib/interactions.ts`
- `src/lib/interactions.test.ts`
- `src/lib/posts.ts`
- `src/lib/posts.test.ts`
- `.superpowers/sdd/task-6-report.md`

### Self-Review

- Like POST requires `{ liked: boolean }`; mutation always rechecks current
  visibility inside its transaction.
- Replayed `true` and `false` requests return stored state and authoritative
  counts without duplicate writes or notifications.
- Commit-time unique/delete conflicts recover to the requested state for
  concurrent identical requests.
- Feed and detail relation counts filter soft-deleted comments and reshare
  posts, matching comment and resave mutation counts.
- `PostCard` sends current desired state, applies counts only from valid server
  results, suppresses concurrent duplicate actions, and releases every lock in
  `finally`.
- Comment rendering merges server props before local comments by ID, so
  refreshed server records replace duplicate local copies.
- No notification route or page duplication was added.
- Unrelated work and untracked SDD files remain untouched.

### Concerns

- No live PostgreSQL service was used. Stateful fakes cover removed
  friendships, rollback, soft deletion, replay, and concurrent uniqueness
  behavior; Prisma query syntax passed production build.
- React Doctor's two interaction warnings conflict with required
  authorization-before-mutation ordering and were not changed.

### Commit

Commit message: `fix: make social interactions replay-safe`

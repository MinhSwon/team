# Acceptance Fix: Private Post Authorization

## Status

Complete. Unauthorized post visibility now matches missing/deleted posts with
`FriendshipError("Post not found", "NOT_FOUND", 404)`.

## RED

Command:

```text
npx tsx --test src/lib/friendships.test.ts
```

Result: 10 passed, 1 failed. Regression received
`FriendshipError: You cannot view this post` from `assertCanViewPost` instead
of the required non-leaking not-found error.

## GREEN

Commands:

```text
npx tsx --test src/lib/friendships.test.ts
npx tsx --test src/lib/friendships.test.ts src/lib/posts.test.ts src/lib/interactions.test.ts
npx tsx --test src/app/api/posts/route.test.ts
```

Results:

- Friendship domain: 11/11 passed.
- Friendship, post, and interaction models: 47/47 passed.
- Post GET nonfriend regression: 1/1 passed with HTTP 404 and
  `{ "error": "Post not found" }`.

## Full Verification

```text
npm test
npm run lint
npm run build
```

Results:

- Tests: 113/113 passed.
- ESLint: passed with no errors.
- Production build: passed.

## Files

- `src/lib/friendships.ts`
- `src/lib/friendships.test.ts`
- `src/lib/posts.test.ts`
- `src/app/api/posts/[id]/route.ts`
- `src/app/api/posts/route.test.ts`

## Self-Review

- Changed only unauthorized `assertCanViewPost` branch; missing/deleted behavior
  remains unchanged.
- Covered stranger, pending, and removed friendship states with exact code,
  status, and message checks.
- Updated stateful post persistence expectations from 403 to shared 404
  contract.
- Interaction stateful tests already modeled 404, so no interaction file change
  was needed.
- Added route-level response coverage through injectable dependencies while
  production `GET` still uses `requireCurrentUser` and `getPostDetail`.

## Concerns

None.

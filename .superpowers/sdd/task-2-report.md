# Task 2 Report: Authentication And Protected App Shell

## Status

Implemented Task 2 in `C:\Users\qqspe\team\.worktrees\social-place-network`.

Public routes remain public:

- `/login`
- `/register`

Root layout does not redirect. `AuthenticatedAppShell` is the reusable
server-side boundary for active app routes. Existing legacy pages also render
the session-aware `Navigation`, which redirects anonymous client renders.

## TDD Evidence

### RED

Created `src/lib/current-user.test.ts` before production auth/helper files.

Command:

```powershell
node --import tsx --test src/lib/current-user.test.ts
```

Result:

```text
Error: Cannot find module './auth'
```

Failure was expected: auth configuration and current-user behavior did not
exist.

### GREEN

Added minimal Better Auth configuration and current-user helpers, then ran:

```powershell
npm test -- --test-name-pattern=requireCurrentUser
```

Result:

```text
tests 8
pass 8
fail 0
```

Final test run:

```powershell
npm test
```

Result:

```text
tests 8
pass 8
fail 0
```

The two Task 2 tests verify:

- Authenticated session lookup returns the Prisma `User`.
- Anonymous session lookup rejects with `UnauthorizedError`.

## Implementation

- Configured Better Auth with Prisma PostgreSQL adapter and email/password.
- Declared Better Auth user fields for persisted `username` and returned `bio`.
- Added pre-create database hook that normalizes username and rejects invalid
  values.
- Added typed React auth client using Better Auth's official
  `inferAdditionalFields` client plugin.
- Mounted Better Auth GET/POST handlers.
- Added `getCurrentUser`, `requireCurrentUser`, and `UnauthorizedError`.
- Added controlled login/register forms preserving email and username on
  errors, showing Better Auth server error text, and navigating to `/feed`.
- Added public login/register pages.
- Added reusable server `AuthenticatedAppShell` without redirecting from
  `RootLayout`.
- Replaced legacy navigation links with Feed, Add, Saved, Friends,
  Notifications, Profile, and sign-out.

## Files

Created:

- `src/lib/auth.ts`
- `src/lib/auth-client.ts`
- `src/lib/current-user.ts`
- `src/lib/current-user.test.ts`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/components/AuthForm.tsx`

Modified:

- `src/app/layout.tsx`
- `src/components/Navigation.tsx`

Report:

- `.superpowers/sdd/task-2-report.md`

## Verification

### Focused lint

Command:

```powershell
npx eslint src/lib/auth.ts src/lib/auth-client.ts src/lib/current-user.ts src/lib/current-user.test.ts 'src/app/api/auth/[...all]/route.ts' 'src/app/(auth)/login/page.tsx' 'src/app/(auth)/register/page.tsx' src/components/AuthForm.tsx src/app/layout.tsx src/components/Navigation.tsx
```

Result: exit 0, no errors or warnings.

### Username hook runtime check

Command:

```powershell
@'
# Inline tsx check invoking auth.options.databaseHooks.user.create.before
'@ | npx tsx -
```

Result:

```text
username hook: normalized and rejected invalid input
```

### React Doctor

Command:

```powershell
npx react-doctor@latest --verbose --scope changed
```

Result:

```text
Score: 100 / 100
No issues found
```

### Full lint

Command:

```powershell
npm run lint
```

Result: exit 1 with 25 errors and 11 warnings, all in untouched legacy files.
No Task 2 file appears in the lint output.

Legacy failures include:

- `src/app/api/decide/route.ts`
- `src/app/api/imports/route.ts`
- `src/app/api/places/route.ts`
- `src/app/decide/page.tsx`
- `src/app/discover/page.tsx`
- `src/app/groups/page.tsx`
- `src/app/import/page.tsx`
- `src/app/saved/page.tsx`
- `src/components/AddPlaceModal.tsx`
- `src/components/MapView.tsx`
- `src/components/PlaceCard.tsx`
- `src/lib/recommendation/engine.ts`

### Build

Command:

```powershell
npm run build
```

Result:

```text
Compiled successfully
Running TypeScript ...
Failed to type check.
```

Auth routes and Task 2 files compiled. Build then stopped on three existing
legacy Prisma-schema mismatches:

```text
src/app/api/decide/route.ts(21,11): 'category' does not exist in PlaceInclude
src/app/api/places/route.ts(16,9): 'category' does not exist in PlaceInclude
src/app/api/places/route.ts(103,11): 'priceRange' does not exist in PlaceCreateInput
```

## Self-Review

- Better Auth owns password hashing and session handling; no custom crypto.
- Username is normalized before persistence and validated at the trust
  boundary.
- Client-provided user IDs are not used for identity.
- Session lookup forwards request headers to `auth.api.getSession`.
- Public auth pages do not render the protected shell or navigation.
- Root layout does not redirect.
- Login/register values remain controlled after server errors.
- Server error messages are displayed without rewriting.
- Navigation contains only required active links and sign-out.
- Discover, decide, groups, and import links were removed.
- No unrelated tracked files were edited.
- `git diff --check` passed.

## Concerns

1. Full lint and build remain blocked by pre-existing legacy modules outside
   Task 2 ownership, listed above.
2. Current legacy pages cannot be moved under a server route-group layout
   within Task 2 ownership. They receive a client session guard through
   `Navigation`; upcoming active page/layout tasks must wrap server-rendered
   content in `AuthenticatedAppShell` or call `requireCurrentUser`.

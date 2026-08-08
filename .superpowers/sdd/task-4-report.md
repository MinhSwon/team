# Task 4 Report: Canonical Place Resolution And Image Upload

## Status

Implemented canonical place search/resolution, authenticated image upload, and
the unified protected Add Place confirmation flow. No unprotected `/add` page
was created. Save/share persistence remains visibly disabled for Task 5.

## RED / GREEN

1. Place resolver tests first failed because `src/lib/places.ts` did not exist,
   then failed 6/6 against compile-only `Not implemented` functions.
   Implementation passed external ID reuse, normalized manual reuse, Maps URL
   fallback, URL rejection, mocked Google search, and provider failure fallback.
2. Route payload parser test failed because `parsePlaceInput` was absent.
   Runtime discriminated-union validation then passed.
3. Upload tests first failed because the route did not exist, then failed 4/4
   against a `501` shell. Auth-first handling, configuration errors, MIME/size
   validation, and Blob upload then passed.
4. Protected Add page test failed because the page still rendered its
   placeholder. The page now renders `AddPlaceModal`, and the test confirms no
   unprotected duplicate exists.
5. Merge regression failed with 2 results for one Google external ID. Search
   now treats the external ID as authoritative across local/provider results.
6. URL allowlist regression accepted `/maps.evil`. Path matching now requires
   exactly `/maps` or a `/maps/` prefix.

## Verification

- Baseline `npm test`: 23 passed, 0 failed.
- Final `npm test`: 36 passed, 0 failed.
- Task 4 scoped `npx eslint ...`: exit 0.
- `npm run build`: exit 0 after Prisma generation, Next compilation, and
  TypeScript checking; no Google or Blob environment keys were set.
- `npx react-doctor@latest --verbose --scope changed`: no issues found, score
  72/100.
- `git diff --check`: no whitespace errors; Git only reported Windows line
  ending conversion notices.
- Local server: existing workspace server responds `200` at
  `http://localhost:3000/login`.
- Full `npm run lint`: exit 1 from unchanged legacy files scheduled for Task 7:
  `src/app/decide/page.tsx`, `src/app/discover/page.tsx`,
  `src/components/MapView.tsx`, `src/lib/recommendation/engine.ts`, plus legacy
  warnings. Task 4 files lint clean.

## Files

- `src/lib/places.ts`
- `src/lib/places.test.ts`
- `src/app/api/places/search/route.ts`
- `src/app/api/places/resolve/route.ts`
- `src/app/api/uploads/route.ts`
- `src/app/api/uploads/route.test.ts`
- `src/components/AddPlaceModal.tsx`
- `src/app/(app)/add/page.tsx`
- `src/app/(app)/layout.test.ts`
- `.superpowers/sdd/task-4-report.md`

## Self-Review

- Google Maps HTML is never scraped. Short links use redirect-only `HEAD`
  resolution.
- Allowed Maps hosts and path boundaries are exact.
- Missing provider key and provider failures preserve local/manual paths.
- External IDs deduplicate before normalized text matching.
- Upload identity is derived before token/body handling.
- Upload accepts one JPEG/PNG/WebP file, rejects files over 5 MB, and namespaces
  Blob paths by current user.
- Optional image failure does not block confirmation.
- Search, Maps Link, and Manual all reach one confirmation form.
- Confirmation includes rating, review, tags, and optional photos.
- Save/share control is disabled and explicitly reserved for Task 5.
- No `any` was added.

## Concerns

- Full-repo lint remains red from unchanged legacy screens/modules outside Task
  4 ownership.
- Manual normalized duplicates have lookup protection but no database unique
  constraint, so concurrent manual creation can still race.
- Browser visual automation was unavailable because the installed Browser
  plugin lacks required `scripts/browser-client.mjs`; automated tests, build,
  React diagnostics, and HTTP server smoke check were completed instead.

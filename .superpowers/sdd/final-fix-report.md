# Social Place Network Final Fix Report

Date: 2026-08-09

Status: **COMPLETE**

Tested application code HEAD:
`557837fd4604e1f769c9e1103ff854234a4345dd`

## Commits

- `d412273` `feat: harden data and resource safety`
- `5d2eee4` `fix: enforce private race-safe social access`
- `20bb816` `feat: complete saved-place management workflow`
- `341671d` `fix: clear changed-file React diagnostics`
- `557837f` `test: isolate acceptance rate-limit buckets`
- Evidence commit: `docs: record final fix wave evidence`

## Requirement Results

1. **Legacy DB safety**
   - Baseline preflight blocks mapped legacy user/place/group/import tables
     before social table creation.
   - README files declare fresh-install-only rollout and unsupported in-place
     conversion.
   - Temporary PostgreSQL proof passed for fresh deploy and legacy rejection.

2. **Manual-place privacy**
   - Local search receives viewer identity and filters manual places to saver
     or accepted friends of a saver.
   - Manual detail uses same visibility rule; strangers, pending, rejected, and
     removed friends receive opaque 404.
   - Verified provider-backed places remain globally readable.
   - Internal exact dedupe returns no owner/content disclosure.

3. **Friend-removal races**
   - Profile visibility/posts use one visibility-filtered query.
   - Friendship responses and like/comment writes use PostgreSQL
     `Serializable` transactions with bounded `P2034` retry.
   - Visibility, write, and notification stay inside one transaction.
   - Stateful tests prove retry-to-404/no-write behavior after removal.
   - Live PostgreSQL PostLike and Comment race proofs passed.

4. **Saved-place opaque authorization**
   - Update/delete find owned records by saved ID plus user ID.
   - Missing and unauthorized mutations return identical
     `404 {"error":"Saved place not found"}`.
   - API/domain tests cover both paths.

5. **Saved/edit/remove workflow**
   - Added `SavedPlaceStatus` with `SAVED`, `WANT_TO_GO`, and `VISITED`;
     migration preserves existing rows as `SAVED`.
   - Saved screen has client search, status filter, edit, and remove.
   - Detail screen has prefilled rating/review/tags/status edit and remove.
   - Unsaved detail saves canonical place directly without blank Add redirect.
   - POST/PATCH status validation and visible browser workflows passed.

6. **Abuse controls and quotas**
   - PostgreSQL `RateLimitBucket` uses atomic upsert/count/reset.
   - User plus IP limits:
     - user search: 30 per 60 seconds
     - place search/provider resolve: 20 per 60 seconds
     - friend requests: 10 per hour
     - comments: 20 per 60 seconds
     - uploads: 10 per hour
   - HTTP 429 includes `Retry-After`.
   - Provider fetch uses a 3-second abort timeout and manual/local fallback.
   - Server bounds: 10 tags, 32 chars/tag, 6 images, 100 notification IDs,
     2,000 review chars, 1,000 comment chars.

7. **Blob ownership and cleanup**
   - `BlobUpload` records owner, URL, pathname, lifecycle, and timestamps.
   - Upload persistence failure attempts immediate provider delete.
   - Save/update claims only current-user, unclaimed upload IDs in transaction.
   - Replace/remove/delete marks Blob rows `PENDING_DELETE` transactionally.
   - `npm run cleanup:blobs` retries pending deletes and expires unclaimed
     uploads older than 24 hours.
   - Mocked tests cover ownership, claim races, pending-delete outbox, provider
     failure retry, orphan expiry, and concurrent cleanup.

8. **Fail-fast DB config**
   - `src/lib/db.ts` requires `DATABASE_URL`; no localhost fallback remains.
   - Test bootstrap sets an explicit unreachable test URL for import-only tests.
   - Missing URL test exits with `DATABASE_URL is required`.

9. **Accessibility, mobile, and test precision**
   - Add control uses ordinary segmented buttons, no incomplete tab ARIA.
   - Browser acceptance runs desktop and 375px mobile.
   - Overflow, bottom-nav clearance, wrapping, and keyboard activation pass.
   - Task 4 timestamp source test scopes the survivor update, both timestamps,
     and update-before-delete ordering.
   - Demo seed requires `ALLOW_DEMO_SEED=1` and refuses production.

10. **External key honesty**
    - Google and Blob keys are absent.
    - No live Google provider or Vercel Blob success is claimed.
    - Staging verification with real keys remains required.

## Verification

```text
Branch commits: 6
Branch files changed: 48
Branch insertions: 3884
Branch deletions: 625
Fresh/legacy migration proofs: 2 PASS, 0 FAIL
Current DB migrations: 3, up to date
Seed runs: 2; credential sign-ins: 3 each
Live PostgreSQL races: 2 PASS, 0 FAIL
Tests: 139 PASS, 0 FAIL
Lint: PASS
Build: PASS
Build ID: 8jBm6NLR61N7cqSfK8CjE
React Doctor: 100/100, no issues
HTTP acceptance: 12 PASS, 0 FAIL
Browser acceptance: 14 PASS, 0 FAIL
Combined acceptance: 26 PASS, 0 FAIL
Tracked artifact scan: clean
Google key: unset
Blob key: unset
```

Exact commands and criterion evidence are in
`docs/acceptance/social-place-network.md`.

## Remaining Concern

Only external staging verification remains: run Google Places success and
Vercel Blob upload/delete/cleanup with real scoped keys. Local fallback,
no-image, ownership, and mocked provider failure paths are verified.

---

## Final Security Review Wave

Date: 2026-08-09

Status: **COMPLETE**

Application code HEAD tested:
`41b70b67fe7ce286fc58ca6e07869405811cdf3d`

### Commit

- `41b70b6` `fix: close final social security gaps`
- Evidence commit: `docs: record final security review evidence`

### Findings Closed

1. **Private post images**
   - Uploads use Vercel Blob private access.
   - Client-visible records contain `/api/media/{uploadId}`, never provider
     Blob URLs or pathnames.
   - Media reads authenticate and re-run current saved-place/friend visibility.
   - Responses use `Cache-Control: private, no-store`; removed friends receive
     opaque 404 on later requests.

2. **Existing image lifecycle**
   - Existing ownership derives only through `UserSavedPlace.userId`.
   - Private Blob rows become `CLAIMED`.
   - Public Blob rows enter durable `PENDING_PRIVATE_COPY` conversion.
   - Unsupported external URLs abort before schema or data mutation.
   - `SavedPlaceImage.blobUploadId` becomes required after backfill.

3. **Failed upload persistence**
   - `RESERVED` ownership rows exist before provider writes.
   - Completion failure attempts immediate provider deletion.
   - Failed deletion records `PENDING_DELETE`; even a failed state update leaves
     durable reservation pathname data for 24-hour orphan cleanup.

4. **Better Auth limiter**
   - `rateLimit.customStorage` implements installed Better Auth `get`, `set`,
     and atomic `consume`.
   - PostgreSQL upsert consumption works across application instances.
   - Proxy headers require explicit `TRUSTED_PROXY_IPS`.
   - `npm run cleanup:rate-limits` removes expired buckets.

5. **Place validation**
   - Area: 120 characters maximum.
   - Website and Maps URL: 2,048 characters maximum.
   - Website: HTTPS only, no username or password.
   - Latitude: `[-90, 90]`; longitude: `[-180, 180]`.
   - Boundary and invalid cases are covered.

6. **Acceptance freshness**
   - Both acceptance scripts build into `.next-acceptance`, start an isolated
     production server, print immutable build and Git identities, and clean up.
   - Final HTTP build: `5Iqn7n_N7h7i2wf1t0iW5`.
   - Final browser build: `29hflnD3iogEIqxXacZHW`.
   - Both report commit
     `41b70b67fe7ce286fc58ca6e07869405811cdf3d`.

7. **Blob cleanup concurrency**
   - PostgreSQL claims use `FOR UPDATE SKIP LOCKED`.
   - `DELETING` and `CONVERTING` states carry five-minute leases.
   - Overlapping workers process each row once; stale leases recover.

8. **Browser coverage**
   - Registration uses visible UI.
   - 375px coverage samples Feed, Friends, Notifications, Profile, Place
     Detail, Saved, and Add.
   - Overflow, bottom-nav clearance, wrapping, and keyboard activation pass.

### TDD Evidence

Focused RED/GREEN evidence retained from this wave:

```text
Acceptance worker-cap assertion: 0/1 failed, then 1/1 passed.
IPv6 acceptance bucket isolation: 0/1 failed, then 1/1 passed.
Acceptance cleanup probe: failed with .next-acceptance present, then passed.
POST_CLEANUP exists=false
```

Browser acceptance initially failed sign-in with HTTP 429. Root cause:
generated IPv6 values shared Better Auth's normalized `/64`. Generating a new
upper `/64` isolated persistent PostgreSQL buckets without weakening limits.

Cleanup failure root cause: terminating the Windows wrapper PID did not stop
the spawned Next process. `taskkill /PID <pid> /T /F` now removes the complete
process tree before deleting the isolated build.

### Verification

```text
Migration proofs: 5 PASS, 0 FAIL
Current DB migrations: 5, up to date
Seed runs: 2; credential sign-ins: 3 each
Live PostgreSQL races: 2 PASS, 0 FAIL
Tests: 154 PASS, 0 FAIL, 0 skipped
Lint: PASS
Build: PASS
Standard build ID: JR6meysh1Bi4t-PLYLvbz
React Doctor: 100/100, 90 files, no issues
HTTP acceptance: 12 PASS, 0 FAIL
Browser acceptance: 14 PASS, 0 FAIL
Combined acceptance: 26 PASS, 0 FAIL
Acceptance build cleanup: PASS
Live-secret pattern matches: 0
Google key: unset
Blob key: unset
```

Exact commands and output are in
`docs/acceptance/social-place-network.md`.

### Self-Review

- Media authorization is query-time, not token-time; friendship removal blocks
  subsequent reads.
- Shared-cache replay is disabled by `private, no-store`.
- Raw provider URLs remain server-side across uploads, posts, profiles, saved
  screens, and API serializers.
- Migration ownership is derived, never guessed.
- Failed uploads always retain either a deletion record or durable reservation
  pathname.
- Cleanup and public-to-private conversion use independent leased claims.
- Better Auth consumes the installed storage API atomically.
- Acceptance identity and cleanup are asserted by the harness itself.

### Remaining Concern

Real Google Places and Vercel Blob success paths remain unverified because
their keys are absent. Staging must verify private upload/proxy, public legacy
conversion, deletion cleanup, and Google success with scoped credentials.

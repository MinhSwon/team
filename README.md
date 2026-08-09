# PlaceDecide

PlaceDecide is a private social place network. Users save canonical places,
publish one post per save, and share activity only with accepted friends.

## Setup

Install packages:

```powershell
npm install
```

Copy `.env.example` to `.env` and configure:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/placedecide?schema=public
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:3000
TRUSTED_PROXY_IPS=
LEGACY_BLOB_STORE_HOSTS=
GOOGLE_MAPS_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

- `DATABASE_URL` is required and must point to PostgreSQL.
- `BETTER_AUTH_SECRET` is required and must contain at least 32 random
  characters.
- `BETTER_AUTH_URL` is required and must match application origin.
- `TRUSTED_PROXY_IPS` must list exact deployment proxy IPs or CIDR ranges,
  comma-separated, in production. Invalid or missing production values fail
  startup. Test/development may leave it empty; Better Auth disables IP
  tracking there instead of using one global fallback bucket. Forwarded IP
  headers are ignored unless this setting is present.
- `LEGACY_BLOB_STORE_HOSTS` lists exact owned public/private Blob hostnames,
  comma-separated. Migration rejects missing or foreign hosts.
- `GOOGLE_MAPS_API_KEY` is optional. Without it, place search and resolution
  fall back to local records or manual confirmation.
- `BLOB_READ_WRITE_TOKEN` is optional. Set it to enable JPEG, PNG, and WebP
  uploads. Save requests authorize images by owned upload ID, never by URL.

## Database

Migration rollout is **fresh-install-only**. In-place legacy upgrade is unsupported.
Use a new database with an explicit export/transform/import plan. If mapped
legacy tables such as `users`, `places`,
`user_saved_places`, group tables, or import tables exist, baseline migration
aborts before creating social tables and reports detected names.
For an unmanaged nonempty schema, Prisma can reject even earlier with `P3005`;
no migration runs and no social table is created. The baseline keeps its own
mapped-table preflight for managed migration histories where it is executed.

Apply committed migrations:

```powershell
npx prisma migrate deploy
```

Baselining guidance applies only to databases already exactly matching the
social schema. See `prisma/migrations/README.md`.

Prove fresh deployment, Prisma's nonempty-schema block, and the baseline's
mapped-table preflight against temporary schemas. The verifier also executes
private/public legacy Blob image backfills and proves unsupported external
image URLs abort before schema or data mutation:

```powershell
npm run verify:migrations
```

## Abuse Limits

PostgreSQL-backed buckets enforce these authenticated-user limits, with a
matching IP bucket when `TRUSTED_PROXY_IPS` enables trustworthy client IP
resolution:

- Better Auth email sign-in: 5 requests per 15 minutes per resolved client IP.
- User search: 30 requests per 60 seconds.
- Place search and provider resolution: 20 requests per 60 seconds.
- Friend requests: 10 requests per hour.
- Comments: 20 requests per 60 seconds.
- Uploads: 10 requests per hour.

Limited responses return HTTP 429 and `Retry-After`.

Prune expired PostgreSQL buckets periodically:

```powershell
npm run cleanup:rate-limits
```

## Blob Cleanup

New uploads use private Vercel Blob access. HTML and APIs expose only stable
`/api/media/{uploadId}` URLs; each media request authenticates, rechecks place
visibility, and returns `Cache-Control: private, no-store`. Friendship removal
therefore blocks later media requests.

Upload reservations are durable before provider writes. Replaced or deleted
images enter `PENDING_DELETE`; unclaimed uploads older than 24 hours are also
eligible. Existing supported public Vercel Blob images enter
`PENDING_PRIVATE_COPY`, are copied to deterministic private paths, then have
their public source deleted. Cleanup workers use leased claims so overlapping
workers do not process one object concurrently.

Both public and private legacy images stay inaccessible in
`PENDING_PRIVATE_COPY` until worker validates JPEG, PNG, or WebP magic bytes
and a 5 MB bound. For existing social-schema databases, set
`LEGACY_BLOB_STORE_HOSTS` and PostgreSQL setting
`placedecide.legacy_blob_store_hosts` to the same exact host list before
migration. Pass the PostgreSQL setting through the connection URL used by
Prisma, for example:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/placedecide?schema=public&options=-c%20placedecide.legacy_blob_store_hosts%3Dstore-id.public.blob.vercel-storage.com%2Cstore-id.private.blob.vercel-storage.com
LEGACY_BLOB_STORE_HOSTS=store-id.public.blob.vercel-storage.com,store-id.private.blob.vercel-storage.com
```

Required order: migrate, run cleanup until conversion has zero failures, run
readiness check, then build/cut over.

```powershell
npm run cleanup:blobs
npm run verify:blob-conversion
```

`npm run build` and `npm start` refuse readiness while conversion or failed
conversion rows remain. Provider deletion failures remain queued for retry.

## Verification

Run tests:

```powershell
npm test
```

Run full lint:

```powershell
npm run lint
```

Build production application:

```powershell
npm run build
```

Both acceptance commands create a fresh production build, start `next start`
on an isolated loopback port, print build ID and commit identity, and stop that
server after the run:

```powershell
npm run acceptance:social
npm run acceptance:browser
```

Demo fixtures require explicit local opt-in and are refused in production:

```powershell
$env:ALLOW_DEMO_SEED="1"
npm run seed:demo
```

## Development

Start local server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

Google Places and Vercel Blob live success require real keys. Local acceptance
uses provider fallback and no-image paths; staging verification with both keys
is still required. No live provider success is claimed without keys.

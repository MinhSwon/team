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
GOOGLE_MAPS_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

- `DATABASE_URL` is required and must point to PostgreSQL.
- `BETTER_AUTH_SECRET` is required and must contain at least 32 random
  characters.
- `BETTER_AUTH_URL` is required and must match application origin.
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
mapped-table preflight against temporary schemas:

```powershell
npm run verify:migrations
```

## Abuse Limits

PostgreSQL-backed buckets enforce these authenticated-user limits, with a
matching IP bucket:

- User search: 30 requests per 60 seconds.
- Place search and provider resolution: 20 requests per 60 seconds.
- Friend requests: 10 requests per hour.
- Comments: 20 requests per 60 seconds.
- Uploads: 10 requests per hour.

Limited responses return HTTP 429 and `Retry-After`.

## Blob Cleanup

Uploads are recorded before use. Replaced or deleted images enter
`PENDING_DELETE`; unclaimed uploads older than 24 hours are also eligible.
With `BLOB_READ_WRITE_TOKEN` configured, run:

```powershell
npm run cleanup:blobs
```

Provider deletion failures remain queued for a later retry.

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
is still required.

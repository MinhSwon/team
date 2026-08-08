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
BLOB_PUBLIC_HOST=store-id.public.blob.vercel-storage.com
```

- `DATABASE_URL` is required and must point to PostgreSQL.
- `BETTER_AUTH_SECRET` is required and must contain at least 32 random
  characters.
- `BETTER_AUTH_URL` is required and must match application origin.
- `GOOGLE_MAPS_API_KEY` is optional. Without it, place search and resolution
  fall back to local records or manual confirmation.
- `BLOB_READ_WRITE_TOKEN` and `BLOB_PUBLIC_HOST` are optional. Set both to
  enable JPEG, PNG, and WebP uploads. `BLOB_PUBLIC_HOST` must be exact Vercel
  Blob hostname without scheme, path, or trailing slash.

## Database

Apply committed migrations:

```powershell
npx prisma migrate deploy
```

For existing databases, follow baseline verification and resolution steps in
`prisma/migrations/README.md` before running migration.

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

## Development

Start local server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

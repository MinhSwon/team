# Prisma Migration History

`20260808000000_init` is the complete baseline generated from an empty
database for the social schema before `Place.dedupeKey`.
`20260808010000_backfill_place_dedupe_key` is the data-preserving delta.

## Fresh Databases

Run:

```powershell
npx prisma migrate deploy
```

Never initialize a fresh database from the ALTER-only second migration.

## Existing Databases

Before marking the baseline applied:

1. Back up the database.
2. Verify its schema matches `20260808000000_init` and that
   `Place.dedupeKey` does not exist.
3. Resolve every reported schema difference before continuing.
4. Mark only the verified baseline as applied:

```powershell
npx prisma migrate resolve --applied 20260808000000_init
npx prisma migrate deploy
```

Do not run `migrate resolve --applied` when the existing schema differs from
the baseline. It records history; it does not create or repair database
objects.

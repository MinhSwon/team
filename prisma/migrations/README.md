# Prisma Migration History

`20260808000000_init` is the complete baseline generated from an empty
database for the social schema before `Place.dedupeKey`.
`20260808010000_backfill_place_dedupe_key` is the data-preserving delta.
`20260809000000_final_fix_wave` adds saved status, atomic rate-limit buckets,
and owned Blob lifecycle records.
`20260809010000_private_blob_lifecycle_enum` preflights existing image URLs,
then commits the private-copy, reservation, and cleanup lease states.
`20260809011000_private_blob_media` repeats the preflight, derives image owners
only through `UserSavedPlace.userId`, and moves all supported image rows to
stable internal media URLs.

## Fresh Databases

This rollout is **fresh-install-only**. The baseline checks the target schema
for legacy mapped tables such as `users`, `places`, `user_saved_places`,
group tables, and import tables. Detection aborts before any social table is
created and reports the detected table names.
For an unmanaged nonempty schema, Prisma may stop first with `P3005`, before
executing baseline SQL. That earlier rejection also creates no social tables.
The baseline preflight covers managed migration histories where the migration
engine proceeds to execute it.

Run:

```powershell
npx prisma migrate deploy
```

Never initialize a fresh database from the ALTER-only second migration.

## Legacy Databases

In-place legacy upgrade is unsupported. Use a new database plus an explicit
export/transform/import plan. Do not run the social baseline beside legacy
data; its preflight intentionally blocks that layout.

## Existing Social Databases

Baselining is only for databases already exactly matching the social schema
represented by `20260808000000_init`. Before marking the baseline applied:

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

Before applying the private-media migrations, inspect every
`SavedPlaceImage.url`:

- Supported private Vercel Blob URLs become `CLAIMED`.
- Supported public Vercel Blob URLs become `PENDING_PRIVATE_COPY`.
- Ownership always comes from the related `UserSavedPlace.userId`.
- Unsupported external URLs abort before the enum, schema, or image data is
  changed. Convert or remove them explicitly; the migration never guesses.

After deploy, configure `BLOB_READ_WRITE_TOKEN` and run:

```powershell
npm run cleanup:blobs
```

The worker copies public objects to private storage, records the private copy
before deleting the public source, retries failures, and leases work so
overlapping workers cannot process one row at once.

## Proof

Run:

```powershell
npm run verify:migrations
```

The script deploys all migrations into a fresh temporary schema, then creates
representative legacy tables in another temporary schema. It proves normal
deployment rejects the nonempty schema and directly exercises the baseline
preflight to verify the mapped-table message before social tables appear. It
also executes private and public legacy image fixtures and proves unsupported
external image URLs leave both schema and data unchanged.

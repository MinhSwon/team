# Prisma Migration History

`20260808000000_init` is the complete baseline generated from an empty
database for the social schema before `Place.dedupeKey`.
`20260808010000_backfill_place_dedupe_key` is the data-preserving delta.
`20260809000000_final_fix_wave` adds saved status, atomic rate-limit buckets,
and owned Blob lifecycle records.
`20260809010000_private_blob_lifecycle_enum` preflights existing image URLs,
then commits the private-copy, reservation, and cleanup lease states.
`20260809011000_private_blob_media` repeats the preflight, derives image owners
only through `UserSavedPlace.userId`, records MIME as unverified until copy,
and moves all supported image rows to stable internal media URLs.
`20260809012000_private_blob_hardening` is validation-only for Blob state:
it checks both private and source references, rejects ambiguous prior
conversion states, preserves dual references until public deletion succeeds,
and clears unsupported legacy `User.image` values.

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

These migration files are unreleased feature-branch history. Development
databases that applied earlier checksums may run guarded repair only when both
`BlobUpload` and `SavedPlaceImage` are empty:

```powershell
$env:ALLOW_UNRELEASED_MIGRATION_REPAIR="1"
npm run repair:unreleased-migrations
```

Command refuses production, partial or unknown history, and any database whose
prior public reference cannot be reconstructed. Recreate such a development
database. Released migration history must never use this repair.

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

- Set `LEGACY_BLOB_STORE_HOSTS` to exact owned hostnames and PostgreSQL
  `placedecide.legacy_blob_store_hosts` to the same comma-separated value.
  Pass the PostgreSQL setting through Prisma's connection URL, for example:
  `?schema=public&options=-c%20placedecide.legacy_blob_store_hosts%3Dstore-id.public.blob.vercel-storage.com%2Cstore-id.private.blob.vercel-storage.com`.
- Both public and private rows become `PENDING_PRIVATE_COPY`; no legacy row is
  readable before byte validation.
- `PENDING_PRIVATE_COPY`, `CONVERTING` before/after private copy, and
  `PENDING_PUBLIC_DELETE` retain original `sourceUrl` until provider deletion
  succeeds.
- Ownership always comes from the related `UserSavedPlace.userId`.
- Unsupported external or foreign-host URLs abort before the enum, schema, or
  image data is changed. Convert or remove them explicitly; migration never
  guesses.

After deploy, configure `BLOB_READ_WRITE_TOKEN` and run:

```powershell
npm run cleanup:blobs
npm run verify:blob-conversion
```

The worker claims at most four rows, processes them sequentially, validates
5 MB size, JPEG/PNG/WebP magic bytes, and trusted MIME,
copies objects to private storage, records the private copy before deleting
the source, retries failures, and leases work so overlapping workers cannot
process one row at once. Build/start readiness must pass before cutover.

## Proof

Run:

```powershell
npm run verify:migrations
```

The script deploys all migrations into a fresh temporary schema, then creates
representative legacy tables in another temporary schema. It proves normal
deployment rejects the nonempty schema and directly exercises the baseline
preflight to verify the mapped-table message before social tables appear. It
also executes private and public legacy image fixtures, exact prior conversion
states, foreign and ambiguous `url`/`sourceUrl` rejection, public-reference
readiness failure, and unsupported external image rollback.

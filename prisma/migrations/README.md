# Prisma Migration History

`20260808000000_init` is the complete baseline generated from an empty
database for the social schema before `Place.dedupeKey`.
`20260808010000_backfill_place_dedupe_key` is the data-preserving delta.
`20260809000000_final_fix_wave` adds saved status, atomic rate-limit buckets,
and owned Blob lifecycle records.

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

## Proof

Run:

```powershell
npm run verify:migrations
```

The script deploys all migrations into a fresh temporary schema, then creates
representative legacy tables in another temporary schema. It proves normal
deployment rejects the nonempty schema and directly exercises the baseline
preflight to verify the mapped-table message before social tables appear.

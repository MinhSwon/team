DO $$
DECLARE
  invalid_hosts text;
  foreign_or_ambiguous text;
  owned_hosts text[];
BEGIN
  owned_hosts := ARRAY(
    SELECT lower(trim(host))
      FROM unnest(
        string_to_array(
          coalesce(
            current_setting('placedecide.legacy_blob_store_hosts', true),
            ''
          ),
          ','
        )
      ) AS host
     WHERE trim(host) <> ''
  );

  SELECT string_agg(host, ', ' ORDER BY host)
    INTO invalid_hosts
    FROM unnest(owned_hosts) AS host
   WHERE host !~ '^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])\.(public|private)\.blob\.vercel-storage\.com$';

  IF invalid_hosts IS NOT NULL
     OR (
       coalesce(array_length(owned_hosts, 1), 0) = 0
       AND EXISTS (
         SELECT 1
           FROM "BlobUpload" blob
           JOIN "SavedPlaceImage" image ON image."blobUploadId" = blob."id"
          WHERE blob."url" IS NOT NULL
             OR blob."sourceUrl" IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION
      'Invalid placedecide.legacy_blob_store_hosts. Configure exact owned Vercel Blob hostnames only: %',
      coalesce(invalid_hosts, '<empty>');
  END IF;

  SELECT string_agg(
           blob."id" || '=' || blob."lifecycle"::text
             || ':url=' || coalesce(blob."url", '<null>')
             || ':sourceUrl=' || coalesce(blob."sourceUrl", '<null>'),
           ', ' ORDER BY blob."id"
         )
    INTO foreign_or_ambiguous
    FROM "BlobUpload" blob
    JOIN "SavedPlaceImage" image ON image."blobUploadId" = blob."id"
   WHERE (
           blob."url" IS NOT NULL
           AND (
             blob."url" !~ '^https://[^/]+/.+'
             OR NOT (
               lower(split_part(blob."url", '/', 3)) = ANY(owned_hosts)
             )
           )
         )
      OR (
           blob."sourceUrl" IS NOT NULL
           AND (
             blob."sourceUrl" !~ '^https://[^/]+/.+'
             OR NOT (
               lower(split_part(blob."sourceUrl", '/', 3)) = ANY(owned_hosts)
             )
           )
         )
      OR (
           blob."sourceUrl" IS NULL
           AND blob."lifecycle" IN (
             'PENDING_PRIVATE_COPY',
             'CONVERTING',
             'PENDING_PUBLIC_DELETE'
           )
         )
      OR (
           blob."sourceUrl" IS NOT NULL
           AND blob."lifecycle" NOT IN (
             'PENDING_PRIVATE_COPY',
             'CONVERTING',
             'PENDING_PUBLIC_DELETE'
           )
         )
      OR (
           blob."lifecycle" = 'PENDING_PRIVATE_COPY'
           AND blob."url" IS NOT NULL
         )
      OR (
           blob."lifecycle" = 'PENDING_PUBLIC_DELETE'
           AND blob."url" IS NULL
         )
      OR (
           blob."url" IS NOT NULL
           AND lower(split_part(blob."url", '/', 3))
             LIKE '%.public.blob.vercel-storage.com'
         )
      OR (
           blob."url" IS NOT NULL
           AND blob."sourceUrl" IS NOT NULL
           AND blob."url" = blob."sourceUrl"
         );

  IF foreign_or_ambiguous IS NOT NULL THEN
    RAISE EXCEPTION
      'Foreign or ambiguous BlobUpload state. Unreleased migration repair must not guess or lose public deletion references: %',
      foreign_or_ambiguous;
  END IF;
END
$$;

ALTER TABLE "BlobUpload"
  ADD COLUMN IF NOT EXISTS "contentType" TEXT;

UPDATE "User"
SET "image" = NULL
WHERE "image" IS NOT NULL;

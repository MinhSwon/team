DO $$
DECLARE
  foreign_urls text;
  owned_hosts text[];
BEGIN
  owned_hosts := ARRAY(
    SELECT trim(host)
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

  SELECT string_agg(blob."id" || '=' || blob."url", ', ' ORDER BY blob."id")
    INTO foreign_urls
    FROM "BlobUpload" blob
    JOIN "SavedPlaceImage" image ON image."blobUploadId" = blob."id"
   WHERE blob."url" ~ '^https://[^/]+/.+'
     AND (
       coalesce(array_length(owned_hosts, 1), 0) = 0
       OR NOT (split_part(blob."url", '/', 3) = ANY(owned_hosts))
     );

  IF foreign_urls IS NOT NULL THEN
    RAISE EXCEPTION
      'Foreign BlobUpload host. Migration requires exact owned legacy Blob hosts in placedecide.legacy_blob_store_hosts: %',
      foreign_urls;
  END IF;
END
$$;

ALTER TABLE "BlobUpload"
  ADD COLUMN IF NOT EXISTS "contentType" TEXT;

UPDATE "BlobUpload" blob
SET
  "sourceUrl" = blob."url",
  "url" = NULL,
  "pathname" = 'places/' || saved."userId" || '/legacy/' || image."id",
  "contentType" = NULL,
  "lifecycle" = 'PENDING_PRIVATE_COPY',
  "leaseUntil" = NULL,
  "lastError" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "SavedPlaceImage" image
JOIN "UserSavedPlace" saved ON saved."id" = image."savedPlaceId"
WHERE image."blobUploadId" = blob."id"
  AND blob."url" ~ '^https://[^/]+/.+';

DO $$
DECLARE
  invalid_hosts text;
  unsupported_urls text;
  ownership_mismatches text;
  duplicate_urls text;
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
       AND EXISTS (SELECT 1 FROM "SavedPlaceImage")
     ) THEN
    RAISE EXCEPTION
      'Invalid placedecide.legacy_blob_store_hosts. Configure exact owned Vercel Blob hostnames only: %',
      coalesce(invalid_hosts, '<empty>');
  END IF;

  SELECT string_agg(image."id" || '=' || image."url", ', ' ORDER BY image."id")
    INTO unsupported_urls
    FROM "SavedPlaceImage" image
   WHERE image."url" !~ '^https://[^/]+/.+'
      OR NOT (lower(split_part(image."url", '/', 3)) = ANY(owned_hosts));

  IF unsupported_urls IS NOT NULL THEN
    RAISE EXCEPTION
      'Unsupported or foreign SavedPlaceImage URL. Migration requires exact owned legacy Blob hosts configured in placedecide.legacy_blob_store_hosts; conversion cannot invent ownership: %',
      unsupported_urls;
  END IF;

  SELECT string_agg(image."id", ', ' ORDER BY image."id")
    INTO ownership_mismatches
    FROM "SavedPlaceImage" image
    JOIN "UserSavedPlace" saved ON saved."id" = image."savedPlaceId"
    JOIN "BlobUpload" blob ON blob."id" = image."blobUploadId"
   WHERE blob."ownerId" <> saved."userId"
      OR blob."url" IS DISTINCT FROM image."url";

  IF ownership_mismatches IS NOT NULL THEN
    RAISE EXCEPTION
      'SavedPlaceImage Blob ownership mismatch. Owner must derive from UserSavedPlace.userId: %',
      ownership_mismatches;
  END IF;

  SELECT string_agg(duplicate."url", ', ' ORDER BY duplicate."url")
    INTO duplicate_urls
    FROM (
      SELECT image."url"
        FROM "SavedPlaceImage" image
       GROUP BY image."url"
      HAVING count(*) > 1
    ) duplicate;

  IF duplicate_urls IS NOT NULL THEN
    RAISE EXCEPTION
      'SavedPlaceImage Blob URL is reused by multiple image rows: %',
      duplicate_urls;
  END IF;
END
$$;

ALTER TYPE "BlobLifecycle" ADD VALUE IF NOT EXISTS 'RESERVED' BEFORE 'UPLOADED';
ALTER TYPE "BlobLifecycle" ADD VALUE IF NOT EXISTS 'PENDING_PRIVATE_COPY' AFTER 'CLAIMED';
ALTER TYPE "BlobLifecycle" ADD VALUE IF NOT EXISTS 'CONVERTING' AFTER 'PENDING_PRIVATE_COPY';
ALTER TYPE "BlobLifecycle" ADD VALUE IF NOT EXISTS 'PENDING_PUBLIC_DELETE' AFTER 'CONVERTING';
ALTER TYPE "BlobLifecycle" ADD VALUE IF NOT EXISTS 'DELETING' AFTER 'PENDING_DELETE';

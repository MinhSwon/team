DO $$
DECLARE
  unsupported_urls text;
  ownership_mismatches text;
  duplicate_urls text;
BEGIN
  SELECT string_agg(image."id" || '=' || image."url", ', ' ORDER BY image."id")
    INTO unsupported_urls
    FROM "SavedPlaceImage" image
   WHERE image."url" !~ '^https://[a-z0-9-]+\.(public|private)\.blob\.vercel-storage\.com/.+\.(jpg|jpeg|png|webp)$';

  IF unsupported_urls IS NOT NULL THEN
    RAISE EXCEPTION
      'Unsupported SavedPlaceImage URL. Migration cannot invent Blob ownership for external objects: %',
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

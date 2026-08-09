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

ALTER TABLE "BlobUpload"
  ALTER COLUMN "url" DROP NOT NULL,
  ALTER COLUMN "lifecycle" SET DEFAULT 'RESERVED',
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "BlobUpload_sourceUrl_key" ON "BlobUpload"("sourceUrl");
CREATE INDEX "BlobUpload_lifecycle_leaseUntil_idx" ON "BlobUpload"("lifecycle", "leaseUntil");

DO $$
DECLARE
  conflicting_existing text;
BEGIN
  SELECT string_agg(image."id", ', ' ORDER BY image."id")
    INTO conflicting_existing
    FROM "SavedPlaceImage" image
    JOIN "UserSavedPlace" saved ON saved."id" = image."savedPlaceId"
    JOIN "BlobUpload" blob ON blob."url" = image."url"
   WHERE image."blobUploadId" IS NULL
     AND blob."ownerId" <> saved."userId";

  IF conflicting_existing IS NOT NULL THEN
    RAISE EXCEPTION
      'SavedPlaceImage matched an existing BlobUpload owned by another user: %',
      conflicting_existing;
  END IF;
END
$$;

INSERT INTO "BlobUpload" (
  "id",
  "ownerId",
  "url",
  "sourceUrl",
  "pathname",
  "lifecycle",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-' || md5(image."id" || ':' || image."url"),
  saved."userId",
  CASE
    WHEN image."url" ~ '\.private\.blob\.vercel-storage\.com/' THEN image."url"
    ELSE NULL
  END,
  CASE
    WHEN image."url" ~ '\.public\.blob\.vercel-storage\.com/' THEN image."url"
    ELSE NULL
  END,
  CASE
    WHEN image."url" ~ '\.private\.blob\.vercel-storage\.com/'
      THEN regexp_replace(image."url", '^https://[^/]+/', '')
    ELSE
      'places/' || saved."userId" || '/legacy/' || image."id" || '.' ||
      lower(substring(image."url" from '\.([A-Za-z0-9]+)$'))
  END,
  CASE
    WHEN image."url" ~ '\.private\.blob\.vercel-storage\.com/'
      THEN 'CLAIMED'::"BlobLifecycle"
    ELSE 'PENDING_PRIVATE_COPY'::"BlobLifecycle"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "SavedPlaceImage" image
JOIN "UserSavedPlace" saved ON saved."id" = image."savedPlaceId"
LEFT JOIN "BlobUpload" existing ON existing."url" = image."url"
WHERE image."blobUploadId" IS NULL
  AND existing."id" IS NULL;

UPDATE "SavedPlaceImage" image
SET "blobUploadId" = blob."id"
FROM "BlobUpload" blob
WHERE image."blobUploadId" IS NULL
  AND (blob."url" = image."url" OR blob."sourceUrl" = image."url");

UPDATE "BlobUpload" blob
SET
  "sourceUrl" = blob."url",
  "url" = NULL,
  "pathname" =
    'places/' || saved."userId" || '/legacy/' || image."id" || '.' ||
    lower(substring(image."url" from '\.([A-Za-z0-9]+)$')),
  "lifecycle" = 'PENDING_PRIVATE_COPY',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "SavedPlaceImage" image
JOIN "UserSavedPlace" saved ON saved."id" = image."savedPlaceId"
WHERE image."blobUploadId" = blob."id"
  AND blob."url" ~ '\.public\.blob\.vercel-storage\.com/';

UPDATE "BlobUpload" blob
SET
  "lifecycle" = 'CLAIMED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "SavedPlaceImage" image
WHERE image."blobUploadId" = blob."id"
  AND blob."url" ~ '\.private\.blob\.vercel-storage\.com/';

UPDATE "SavedPlaceImage" image
SET "url" = '/api/media/' || image."blobUploadId";

ALTER TABLE "SavedPlaceImage"
  ALTER COLUMN "blobUploadId" SET NOT NULL;

ALTER TABLE "SavedPlaceImage"
  DROP CONSTRAINT "SavedPlaceImage_blobUploadId_fkey";

ALTER TABLE "SavedPlaceImage"
  ADD CONSTRAINT "SavedPlaceImage_blobUploadId_fkey"
  FOREIGN KEY ("blobUploadId") REFERENCES "BlobUpload"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

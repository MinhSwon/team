BEGIN;

ALTER TABLE "Place" ADD COLUMN "dedupeKey" TEXT;

CREATE TEMP TABLE "_manual_place_duplicates" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "normalizedName", "normalizedAddress"
      ORDER BY "createdAt", "id"
    ) AS survivor_id,
    row_number() OVER (
      PARTITION BY "normalizedName", "normalizedAddress"
      ORDER BY "createdAt", "id"
    ) AS duplicate_rank
  FROM "Place"
  WHERE "externalPlaceId" IS NULL
)
SELECT
  "id" AS duplicate_id,
  survivor_id
FROM ranked
WHERE duplicate_rank > 1;

CREATE TEMP TABLE "_manual_saved_place_duplicates" ON COMMIT DROP AS
SELECT
  duplicate_save."id" AS duplicate_saved_place_id,
  survivor_save."id" AS survivor_saved_place_id
FROM "_manual_place_duplicates" place_merge
JOIN "UserSavedPlace" duplicate_save
  ON duplicate_save."placeId" = place_merge.duplicate_id
JOIN "UserSavedPlace" survivor_save
  ON survivor_save."placeId" = place_merge.survivor_id
 AND survivor_save."userId" = duplicate_save."userId";

UPDATE "SavedPlaceImage" image
SET "savedPlaceId" = save_merge.survivor_saved_place_id
FROM "_manual_saved_place_duplicates" save_merge
WHERE image."savedPlaceId" = save_merge.duplicate_saved_place_id;

CREATE TEMP TABLE "_manual_post_moves" ON COMMIT DROP AS
SELECT
  duplicate_post."id" AS duplicate_post_id,
  save_merge.survivor_saved_place_id,
  row_number() OVER (
    PARTITION BY save_merge.survivor_saved_place_id
    ORDER BY duplicate_post."createdAt", duplicate_post."id"
  ) AS post_rank
FROM "_manual_saved_place_duplicates" save_merge
JOIN "Post" duplicate_post
  ON duplicate_post."savedPlaceId" = save_merge.duplicate_saved_place_id
WHERE NOT EXISTS (
  SELECT 1
  FROM "Post" survivor_post
  WHERE survivor_post."savedPlaceId" = save_merge.survivor_saved_place_id
);

UPDATE "Post" duplicate_post
SET "savedPlaceId" = post_move.survivor_saved_place_id
FROM "_manual_post_moves" post_move
WHERE duplicate_post."id" = post_move.duplicate_post_id
  AND post_move.post_rank = 1;

DELETE FROM "UserSavedPlace" duplicate_save
USING "_manual_saved_place_duplicates" save_merge
WHERE duplicate_save."id" = save_merge.duplicate_saved_place_id;

UPDATE "UserSavedPlace" saved_place
SET "placeId" = place_merge.survivor_id
FROM "_manual_place_duplicates" place_merge
WHERE saved_place."placeId" = place_merge.duplicate_id;

DELETE FROM "Place" duplicate_place
USING "_manual_place_duplicates" place_merge
WHERE duplicate_place."id" = place_merge.duplicate_id;

UPDATE "Place"
SET "dedupeKey" =
  octet_length(convert_to("normalizedName", 'UTF8'))::text || ':' || "normalizedName" || "normalizedAddress"
WHERE "externalPlaceId" IS NULL
  AND "dedupeKey" IS NULL;

CREATE UNIQUE INDEX "Place_dedupeKey_key" ON "Place"("dedupeKey");

COMMIT;

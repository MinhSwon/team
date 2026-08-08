BEGIN;

DO $$
BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Place dedupe migration requires UTF8 server_encoding, found %',
      current_setting('server_encoding');
  END IF;
END
$$;

ALTER TABLE "Place" ADD COLUMN "dedupeKey" CHAR(32);

LOCK TABLE "UserSavedPlace", "SavedPlaceImage", "Post"
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_manual_place_groups" ON COMMIT DROP AS
SELECT
  place."id" AS place_id,
  md5(
    octet_length(convert_to(place."normalizedName", 'UTF8'))::text ||
    ':' ||
    place."normalizedName" ||
    place."normalizedAddress"
  ) AS dedupe_key,
  first_value(place."id") OVER (
    PARTITION BY place."normalizedName", place."normalizedAddress"
    ORDER BY place."createdAt", place."id"
  ) AS survivor_place_id,
  row_number() OVER (
    PARTITION BY place."normalizedName", place."normalizedAddress"
    ORDER BY place."createdAt", place."id"
  ) AS place_rank
FROM "Place" place
WHERE place."externalPlaceId" IS NULL;

CREATE TEMP TABLE "_manual_place_duplicates" ON COMMIT DROP AS
SELECT
  place_id AS duplicate_id,
  survivor_place_id AS survivor_id
FROM "_manual_place_groups"
WHERE place_rank > 1;

DO $$
DECLARE
  conflicting_place_metadata text;
BEGIN
  SELECT string_agg(
    format(
      'dedupeKey=%s placeIds=[%s] fields=[%s]',
      conflict.dedupe_key,
      conflict.place_ids,
      conflict.conflict_fields
    ),
    '; ' ORDER BY conflict.dedupe_key
  )
  INTO conflicting_place_metadata
  FROM (
    SELECT
      place_group.dedupe_key,
      string_agg(place."id", ',' ORDER BY place."id") AS place_ids,
      concat_ws(
        ',',
        CASE WHEN count(DISTINCT place."name") > 1 THEN 'name' END,
        CASE WHEN count(DISTINCT place."address") > 1 THEN 'address' END,
        CASE WHEN count(DISTINCT place."area") > 1 THEN 'area' END,
        CASE WHEN count(DISTINCT place."latitude") > 1 THEN 'latitude' END,
        CASE WHEN count(DISTINCT place."longitude") > 1 THEN 'longitude' END,
        CASE WHEN count(DISTINCT place."website") > 1 THEN 'website' END,
        CASE WHEN count(DISTINCT place."externalSource") > 1 THEN 'externalSource' END
      ) AS conflict_fields
    FROM "_manual_place_groups" place_group
    JOIN "Place" place
      ON place."id" = place_group.place_id
    GROUP BY place_group.dedupe_key
    HAVING count(*) > 1
      AND (
        count(DISTINCT place."name") > 1
        OR count(DISTINCT place."address") > 1
        OR count(DISTINCT place."area") > 1
        OR count(DISTINCT place."latitude") > 1
        OR count(DISTINCT place."longitude") > 1
        OR count(DISTINCT place."website") > 1
        OR count(DISTINCT place."externalSource") > 1
      )
  ) conflict;

  IF conflicting_place_metadata IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot merge duplicate Places with conflicting metadata; conflicts=%',
      conflicting_place_metadata;
  END IF;
END
$$;

CREATE TEMP TABLE "_manual_place_metadata" ON COMMIT DROP AS
SELECT
  place_group.survivor_place_id,
  max(place."area") AS "area",
  max(place."latitude") AS "latitude",
  max(place."longitude") AS "longitude",
  max(place."website") AS "website",
  max(place."externalSource") AS "externalSource",
  max(place."updatedAt") AS "updatedAt"
FROM "_manual_place_groups" place_group
JOIN "Place" place
  ON place."id" = place_group.place_id
GROUP BY place_group.survivor_place_id
HAVING count(*) > 1;

CREATE TEMP TABLE "_manual_saved_place_groups" ON COMMIT DROP AS
SELECT
  saved_place."id" AS saved_place_id,
  saved_place."userId" AS user_id,
  place_group.dedupe_key,
  place_group.survivor_place_id,
  first_value(saved_place."id") OVER (
    PARTITION BY saved_place."userId", place_group.survivor_place_id
    ORDER BY
      (saved_place."placeId" = place_group.survivor_place_id) DESC,
      saved_place."createdAt",
      saved_place."id"
  ) AS survivor_saved_place_id
FROM "_manual_place_groups" place_group
JOIN "UserSavedPlace" saved_place
  ON saved_place."placeId" = place_group.place_id;

DO $$
DECLARE
  conflicting_saved_place_metadata text;
BEGIN
  SELECT string_agg(
    format(
      'dedupeKey=%s userId=%s savedPlaceIds=[%s] fields=[%s]',
      conflict.dedupe_key,
      conflict.user_id,
      conflict.saved_place_ids,
      conflict.conflict_fields
    ),
    '; ' ORDER BY conflict.dedupe_key, conflict.user_id
  )
  INTO conflicting_saved_place_metadata
  FROM (
    SELECT
      saved_group.dedupe_key,
      saved_group.user_id,
      string_agg(
        saved_place."id",
        ',' ORDER BY saved_place."id"
      ) AS saved_place_ids,
      concat_ws(
        ',',
        CASE WHEN count(DISTINCT saved_place."rating") > 1 THEN 'rating' END,
        CASE WHEN count(DISTINCT saved_place."review") > 1 THEN 'review' END,
        CASE WHEN count(DISTINCT saved_place."sourcePostId") > 1 THEN 'sourcePostId' END
      ) AS conflict_fields
    FROM "_manual_saved_place_groups" saved_group
    JOIN "UserSavedPlace" saved_place
      ON saved_place."id" = saved_group.saved_place_id
    GROUP BY saved_group.dedupe_key, saved_group.user_id
    HAVING count(DISTINCT saved_place."rating") > 1
      OR count(DISTINCT saved_place."review") > 1
      OR count(DISTINCT saved_place."sourcePostId") > 1
  ) conflict;

  IF conflicting_saved_place_metadata IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot merge duplicate saved places with conflicting metadata; conflicts=%',
      conflicting_saved_place_metadata;
  END IF;
END
$$;

DO $$
DECLARE
  conflicting_post_ids text;
BEGIN
  SELECT string_agg(
    format(
      'dedupeKey=%s userId=%s savedPlaceIds=[%s] postIds=[%s]',
      conflict.dedupe_key,
      conflict.user_id,
      conflict.saved_place_ids,
      conflict.post_ids
    ),
    '; ' ORDER BY conflict.dedupe_key, conflict.user_id
  )
  INTO conflicting_post_ids
  FROM (
    SELECT
      saved_group.dedupe_key,
      saved_group.user_id,
      string_agg(
        DISTINCT saved_group.saved_place_id,
        ',' ORDER BY saved_group.saved_place_id
      ) AS saved_place_ids,
      string_agg(post."id", ',' ORDER BY post."id") AS post_ids
    FROM "_manual_saved_place_groups" saved_group
    JOIN "Post" post
      ON post."savedPlaceId" = saved_group.saved_place_id
    GROUP BY saved_group.dedupe_key, saved_group.user_id
    HAVING count(*) > 1
  ) conflict;

  IF conflicting_post_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot merge duplicate saved places without deleting posts; conflicting_post_ids=%',
      conflicting_post_ids;
  END IF;
END
$$;

CREATE TEMP TABLE "_manual_saved_place_metadata" ON COMMIT DROP AS
SELECT
  saved_group.survivor_saved_place_id,
  (
    array_agg(
      "rating"
      ORDER BY saved_place."updatedAt" DESC, saved_place."createdAt" DESC, saved_place."id" DESC
    ) FILTER (WHERE "rating" IS NOT NULL)
  )[1] AS "rating",
  (
    array_agg(
      "review"
      ORDER BY saved_place."updatedAt" DESC, saved_place."createdAt" DESC, saved_place."id" DESC
    ) FILTER (WHERE "review" IS NOT NULL)
  )[1] AS "review",
  (
    array_agg(
      "sourcePostId"
      ORDER BY saved_place."updatedAt" DESC, saved_place."createdAt" DESC, saved_place."id" DESC
    ) FILTER (WHERE "sourcePostId" IS NOT NULL)
  )[1] AS "sourcePostId",
  ARRAY(
    SELECT DISTINCT tag
    FROM "_manual_saved_place_groups" tag_group
    JOIN "UserSavedPlace" tag_source
      ON tag_source."id" = tag_group.saved_place_id
    CROSS JOIN LATERAL unnest(tag_source."tags") AS tag
    WHERE tag_group.survivor_saved_place_id =
      saved_group.survivor_saved_place_id
    ORDER BY tag
  ) AS "tags"
FROM "_manual_saved_place_groups" saved_group
JOIN "UserSavedPlace" saved_place
  ON saved_place."id" = saved_group.saved_place_id
GROUP BY saved_group.survivor_saved_place_id;

UPDATE "Place" survivor
SET
  "area" = metadata."area",
  "latitude" = metadata."latitude",
  "longitude" = metadata."longitude",
  "website" = metadata."website",
  "externalSource" = metadata."externalSource",
  "updatedAt" = metadata."updatedAt"
FROM "_manual_place_metadata" metadata
WHERE survivor."id" = metadata.survivor_place_id;

UPDATE "UserSavedPlace" survivor
SET
  "rating" = metadata."rating",
  "review" = metadata."review",
  "sourcePostId" = metadata."sourcePostId",
  "tags" = metadata."tags"
FROM "_manual_saved_place_metadata" metadata
WHERE survivor."id" = metadata.survivor_saved_place_id;

UPDATE "SavedPlaceImage" image
SET "savedPlaceId" = saved_group.survivor_saved_place_id
FROM "_manual_saved_place_groups" saved_group
WHERE image."savedPlaceId" = saved_group.saved_place_id
  AND saved_group.saved_place_id <> saved_group.survivor_saved_place_id;

UPDATE "Post" post
SET "savedPlaceId" = saved_group.survivor_saved_place_id
FROM "_manual_saved_place_groups" saved_group
WHERE post."savedPlaceId" = saved_group.saved_place_id
  AND saved_group.saved_place_id <> saved_group.survivor_saved_place_id;

DELETE FROM "UserSavedPlace" duplicate_save
USING "_manual_saved_place_groups" saved_group
WHERE duplicate_save."id" = saved_group.saved_place_id
  AND saved_group.saved_place_id <> saved_group.survivor_saved_place_id;

UPDATE "UserSavedPlace" survivor
SET "placeId" = saved_group.survivor_place_id
FROM (
  SELECT DISTINCT survivor_saved_place_id, survivor_place_id
  FROM "_manual_saved_place_groups"
) saved_group
WHERE survivor."id" = saved_group.survivor_saved_place_id;

DELETE FROM "Place" duplicate_place
USING "_manual_place_duplicates" place_merge
WHERE duplicate_place."id" = place_merge.duplicate_id;

UPDATE "Place"
SET "dedupeKey" = md5(
  octet_length(convert_to("normalizedName", 'UTF8'))::text ||
  ':' ||
  "normalizedName" ||
  "normalizedAddress"
)
WHERE "externalPlaceId" IS NULL
  AND "dedupeKey" IS NULL;

CREATE UNIQUE INDEX "Place_dedupeKey_key" ON "Place"("dedupeKey");

COMMIT;

-- CreateEnum
CREATE TYPE "SavedPlaceStatus" AS ENUM ('SAVED', 'WANT_TO_GO', 'VISITED');

-- CreateEnum
CREATE TYPE "BlobLifecycle" AS ENUM ('UPLOADED', 'CLAIMED', 'PENDING_DELETE');

-- AlterTable
ALTER TABLE "UserSavedPlace"
ADD COLUMN "status" "SavedPlaceStatus" NOT NULL DEFAULT 'SAVED';

-- AlterTable
ALTER TABLE "SavedPlaceImage"
ADD COLUMN "blobUploadId" TEXT;

-- CreateTable
CREATE TABLE "BlobUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "lifecycle" "BlobLifecycle" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlobUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedPlaceImage_blobUploadId_key" ON "SavedPlaceImage"("blobUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "BlobUpload_url_key" ON "BlobUpload"("url");

-- CreateIndex
CREATE UNIQUE INDEX "BlobUpload_pathname_key" ON "BlobUpload"("pathname");

-- CreateIndex
CREATE INDEX "BlobUpload_ownerId_lifecycle_idx" ON "BlobUpload"("ownerId", "lifecycle");

-- CreateIndex
CREATE INDEX "BlobUpload_lifecycle_createdAt_idx" ON "BlobUpload"("lifecycle", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- AddForeignKey
ALTER TABLE "SavedPlaceImage" ADD CONSTRAINT "SavedPlaceImage_blobUploadId_fkey"
FOREIGN KEY ("blobUploadId") REFERENCES "BlobUpload"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlobUpload" ADD CONSTRAINT "BlobUpload_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

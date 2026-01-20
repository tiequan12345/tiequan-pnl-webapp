-- Add status to Asset for active/inactive filtering
ALTER TABLE "Asset" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

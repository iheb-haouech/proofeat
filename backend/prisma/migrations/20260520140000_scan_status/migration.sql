-- AlterTable
ALTER TABLE "ProofCamScan" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'done';

-- CreateIndex
CREATE INDEX "ProofCamScan_status_idx" ON "ProofCamScan"("status");

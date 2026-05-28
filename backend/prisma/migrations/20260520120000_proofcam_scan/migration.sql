-- CreateTable
CREATE TABLE "ProofCamScan" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "processedUrl" TEXT,
    "ticketNumber" TEXT,
    "customerName" TEXT,
    "originalName" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofCamScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProofCamScan_ticketNumber_idx" ON "ProofCamScan"("ticketNumber");

-- CreateIndex
CREATE INDEX "ProofCamScan_createdAt_idx" ON "ProofCamScan"("createdAt");

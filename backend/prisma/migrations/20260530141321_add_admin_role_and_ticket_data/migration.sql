-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CLIENT');

-- AlterTable
ALTER TABLE "ProofCamScan" ADD COLUMN     "parsedData" JSONB,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "ticketDate" TIMESTAMP(3),
ADD COLUMN     "totalAmount" DOUBLE PRECISION,
ADD COLUMN     "userId" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'processing';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'CLIENT';

-- CreateIndex
CREATE INDEX "ProofCamScan_userId_idx" ON "ProofCamScan"("userId");

-- AddForeignKey
ALTER TABLE "ProofCamScan" ADD CONSTRAINT "ProofCamScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "AttendanceOverride_createdAt_idx";

-- AlterTable
ALTER TABLE "ProofCamScan" ADD COLUMN     "validation" JSONB;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

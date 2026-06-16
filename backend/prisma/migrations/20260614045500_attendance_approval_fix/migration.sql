-- CreateEnum
CREATE TYPE "AttendanceApprovalStatus" AS ENUM ('ACCEPTED', 'SUSPICIOUS', 'OVERRIDDEN', 'REJECTED');

-- AlterTable
ALTER TABLE "AttendanceEvent"
ADD COLUMN     "approvalStatus" "AttendanceApprovalStatus" NOT NULL DEFAULT 'ACCEPTED',
ADD COLUMN     "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "AttendanceSchedule" ALTER COLUMN "breakMinAfterHours" SET DEFAULT 2,
ALTER COLUMN "qrWindowMinutes" SET DEFAULT 30;

-- CreateTable
CREATE TABLE "AttendanceAllowedIp" (
    "id" SERIAL NOT NULL,
    "restaurant" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceAllowedIp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceKioskIp" (
    "id" SERIAL NOT NULL,
    "restaurant" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceKioskIp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceOverride" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER,
    "userId" INTEGER,
    "scheduleId" INTEGER,
    "reason" TEXT,
    "approvedBy" INTEGER,
    "status" "AttendanceApprovalStatus" NOT NULL DEFAULT 'OVERRIDDEN',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAllowedIp_restaurant_ip_key" ON "AttendanceAllowedIp"("restaurant", "ip");

-- CreateIndex
CREATE INDEX "AttendanceAllowedIp_restaurant_idx" ON "AttendanceAllowedIp"("restaurant");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceKioskIp_restaurant_ip_key" ON "AttendanceKioskIp"("restaurant", "ip");

-- CreateIndex
CREATE INDEX "AttendanceKioskIp_restaurant_idx" ON "AttendanceKioskIp"("restaurant");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceOverride_eventId_key" ON "AttendanceOverride"("eventId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_approvalStatus_idx" ON "AttendanceEvent"("approvalStatus");

-- CreateIndex
CREATE INDEX "AttendanceEvent_isSuspicious_idx" ON "AttendanceEvent"("isSuspicious");

-- CreateIndex
CREATE INDEX "AttendanceOverride_createdAt_idx" ON "AttendanceOverride"("createdAt");

-- AddForeignKey
ALTER TABLE "AttendanceOverride" ADD CONSTRAINT "AttendanceOverride_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AttendanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceOverride" ADD CONSTRAINT "AttendanceOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceOverride" ADD CONSTRAINT "AttendanceOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AttendanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceOverride" ADD CONSTRAINT "AttendanceOverride_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cleanup requested by user: remove IP rule data and pointages that stored IP addresses.
DELETE FROM "AttendanceEvent" WHERE "ipAddress" IS NOT NULL;
DELETE FROM "AttendanceAllowedIp";
DELETE FROM "AttendanceKioskIp";

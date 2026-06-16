/*
  Warnings:

  - You are about to drop the column `minWorkBeforeBreak` on the `AttendanceSchedule` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AttendanceQROverrideType" AS ENUM ('FORCE_OPEN', 'FORCE_ACCEPT', 'FORCE_CLOSE');

-- AlterTable
ALTER TABLE "AttendanceEvent" ADD COLUMN     "isOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionId" INTEGER;

-- AlterTable
ALTER TABLE "AttendanceSchedule" DROP COLUMN "minWorkBeforeBreak",
ADD COLUMN     "breakMinAfterHours" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "manualOverrideAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxBreakPerDay" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "qrWindowMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "teamId" INTEGER;

-- CreateTable
CREATE TABLE "AttendanceTeam" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceTeamDayAssignment" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceTeamDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceDayOff" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDayOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceQrSession" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "scheduleId" INTEGER,
    "openedById" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "manualOpen" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceQrSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceTeam_name_key" ON "AttendanceTeam"("name");

-- CreateIndex
CREATE INDEX "AttendanceTeamDayAssignment_dayOfWeek_idx" ON "AttendanceTeamDayAssignment"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceTeamDayAssignment_teamId_dayOfWeek_key" ON "AttendanceTeamDayAssignment"("teamId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "AttendanceDayOff_date_idx" ON "AttendanceDayOff"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDayOff_userId_date_key" ON "AttendanceDayOff"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceQrSession_token_key" ON "AttendanceQrSession"("token");

-- CreateIndex
CREATE INDEX "AttendanceQrSession_isOpen_idx" ON "AttendanceQrSession"("isOpen");

-- CreateIndex
CREATE INDEX "AttendanceQrSession_expiresAt_idx" ON "AttendanceQrSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AttendanceEvent_sessionId_idx" ON "AttendanceEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceSchedule_teamId_idx" ON "AttendanceSchedule"("teamId");

-- AddForeignKey
ALTER TABLE "AttendanceTeamDayAssignment" ADD CONSTRAINT "AttendanceTeamDayAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AttendanceTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSchedule" ADD CONSTRAINT "AttendanceSchedule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AttendanceTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDayOff" ADD CONSTRAINT "AttendanceDayOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceQrSession" ADD CONSTRAINT "AttendanceQrSession_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AttendanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceQrSession" ADD CONSTRAINT "AttendanceQrSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceQrSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

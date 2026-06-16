-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'CLIENT');

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('CARTON', 'KG');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "client" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "image" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proof" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofCamScan" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "processedUrl" TEXT,
    "ticketNumber" TEXT,
    "customerName" TEXT,
    "phoneNumber" TEXT,
    "ticketDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION,
    "parsedData" JSONB,
    "userId" INTEGER,
    "originalName" TEXT,
    "rawText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofCamScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryProduct" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "stockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockUnit" "StockUnit" NOT NULL,
    "alertThreshold" DOUBLE PRECISION NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsage" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockInvoiceBackup" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "originalName" TEXT,
    "amount" DECIMAL(10,2),
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inventoryProductId" INTEGER,

    CONSTRAINT "StockInvoiceBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "role" "UserRole",
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRelease" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'proofcam',
    "csvPath" TEXT,
    "jsonPath" TEXT,
    "availableFrom" TIMESTAMP(3) NOT NULL,
    "availableUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSchedule" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "restaurant" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "minWorkBeforeBreak" INTEGER NOT NULL DEFAULT 120,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "scheduleId" INTEGER,
    "eventType" "AttendanceEventType" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "qrToken" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantKiosk" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "qrSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantKiosk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ProofCamScan_ticketNumber_idx" ON "ProofCamScan"("ticketNumber");

-- CreateIndex
CREATE INDEX "ProofCamScan_createdAt_idx" ON "ProofCamScan"("createdAt");

-- CreateIndex
CREATE INDEX "ProofCamScan_status_idx" ON "ProofCamScan"("status");

-- CreateIndex
CREATE INDEX "ProofCamScan_userId_idx" ON "ProofCamScan"("userId");

-- CreateIndex
CREATE INDEX "InventoryProduct_name_idx" ON "InventoryProduct"("name");

-- CreateIndex
CREATE INDEX "InventoryUsage_productId_idx" ON "InventoryUsage"("productId");

-- CreateIndex
CREATE INDEX "InventoryUsage_storeId_idx" ON "InventoryUsage"("storeId");

-- CreateIndex
CREATE INDEX "InventoryUsage_createdAt_idx" ON "InventoryUsage"("createdAt");

-- CreateIndex
CREATE INDEX "StockAlert_productId_idx" ON "StockAlert"("productId");

-- CreateIndex
CREATE INDEX "StockAlert_isRead_idx" ON "StockAlert"("isRead");

-- CreateIndex
CREATE INDEX "StockAlert_createdAt_idx" ON "StockAlert"("createdAt");

-- CreateIndex
CREATE INDEX "StockInvoiceBackup_uploadedById_idx" ON "StockInvoiceBackup"("uploadedById");

-- CreateIndex
CREATE INDEX "StockInvoiceBackup_createdAt_idx" ON "StockInvoiceBackup"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_role_idx" ON "Notification"("role");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "DatasetRelease_kind_isActive_idx" ON "DatasetRelease"("kind", "isActive");

-- CreateIndex
CREATE INDEX "DatasetRelease_availableUntil_idx" ON "DatasetRelease"("availableUntil");

-- CreateIndex
CREATE INDEX "AttendanceSchedule_userId_idx" ON "AttendanceSchedule"("userId");

-- CreateIndex
CREATE INDEX "AttendanceSchedule_dayOfWeek_idx" ON "AttendanceSchedule"("dayOfWeek");

-- CreateIndex
CREATE INDEX "AttendanceEvent_userId_idx" ON "AttendanceEvent"("userId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_eventType_idx" ON "AttendanceEvent"("eventType");

-- CreateIndex
CREATE INDEX "AttendanceEvent_eventAt_idx" ON "AttendanceEvent"("eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantKiosk_qrSecret_key" ON "RestaurantKiosk"("qrSecret");

-- AddForeignKey
ALTER TABLE "ProofCamScan" ADD CONSTRAINT "ProofCamScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryProduct" ADD CONSTRAINT "InventoryProduct_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInvoiceBackup" ADD CONSTRAINT "StockInvoiceBackup_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInvoiceBackup" ADD CONSTRAINT "StockInvoiceBackup_inventoryProductId_fkey" FOREIGN KEY ("inventoryProductId") REFERENCES "InventoryProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSchedule" ADD CONSTRAINT "AttendanceSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AttendanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

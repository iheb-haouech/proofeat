-- CreateTable
CREATE TABLE "RestaurantHours" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "openDays" INTEGER[],
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantHours_pkey" PRIMARY KEY ("id")
);

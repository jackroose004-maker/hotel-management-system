-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "offer_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "offer_name" TEXT;

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(10,2) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "banner_text" TEXT,
    "banner_text_ar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_is_active_starts_at_ends_at_idx" ON "offers"("is_active", "starts_at", "ends_at");

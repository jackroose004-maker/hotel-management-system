-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "packing_charge" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "packing_charge" DECIMAL(10,2) NOT NULL DEFAULT 0;

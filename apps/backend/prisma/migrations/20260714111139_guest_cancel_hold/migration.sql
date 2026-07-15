-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "held_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "self_cancel_window_mins" INTEGER NOT NULL DEFAULT 5;

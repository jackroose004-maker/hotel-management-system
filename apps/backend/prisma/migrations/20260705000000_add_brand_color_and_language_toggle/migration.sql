ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "brand_color" TEXT NOT NULL DEFAULT '#f59e0b';
ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "show_language_toggle" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "skip_kitchen_stages" BOOLEAN NOT NULL DEFAULT false;

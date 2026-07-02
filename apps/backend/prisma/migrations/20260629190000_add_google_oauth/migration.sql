ALTER TABLE "users" ADD COLUMN "google_id" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

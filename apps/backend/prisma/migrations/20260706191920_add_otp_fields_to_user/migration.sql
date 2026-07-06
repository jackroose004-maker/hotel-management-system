/*
  Warnings:

  - You are about to drop the `verification_tokens` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otp_code" TEXT,
ADD COLUMN     "otp_expiry" TIMESTAMP(3);

-- DropTable
DROP TABLE "verification_tokens";

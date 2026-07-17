-- DropIndex
DROP INDEX "staff_feedback_order_id_key";

-- AlterTable
ALTER TABLE "staff_feedback" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SETTLE';

-- CreateIndex
CREATE INDEX "staff_feedback_order_id_idx" ON "staff_feedback"("order_id");

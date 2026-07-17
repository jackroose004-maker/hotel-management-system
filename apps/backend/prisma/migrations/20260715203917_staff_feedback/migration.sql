-- CreateTable
CREATE TABLE "staff_feedback" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "is_complaint" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_feedback_order_id_key" ON "staff_feedback"("order_id");

-- CreateIndex
CREATE INDEX "staff_feedback_staff_id_idx" ON "staff_feedback"("staff_id");

-- CreateIndex
CREATE INDEX "staff_feedback_created_at_idx" ON "staff_feedback"("created_at");

-- AddForeignKey
ALTER TABLE "staff_feedback" ADD CONSTRAINT "staff_feedback_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_feedback" ADD CONSTRAINT "staff_feedback_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

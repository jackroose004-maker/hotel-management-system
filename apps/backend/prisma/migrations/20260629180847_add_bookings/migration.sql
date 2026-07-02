-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "table_id" TEXT,
    "party_size" INTEGER NOT NULL,
    "slot_date" DATE NOT NULL,
    "slot_time" TEXT NOT NULL,
    "slot_expires_at" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_strikes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "last_no_show_at" TIMESTAMP(3),
    "blocked_until" TIMESTAMP(3),
    "cancel_count_24h" INTEGER NOT NULL DEFAULT 0,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_strikes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");

-- CreateIndex
CREATE INDEX "bookings_customer_id_slot_date_idx" ON "bookings"("customer_id", "slot_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_table_id_slot_date_slot_time_key" ON "bookings"("table_id", "slot_date", "slot_time");

-- CreateIndex
CREATE UNIQUE INDEX "customer_strikes_customer_id_key" ON "customer_strikes"("customer_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_strikes" ADD CONSTRAINT "customer_strikes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "table_groups" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "table_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,

    CONSTRAINT "table_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_groups_closed_at_idx" ON "table_groups"("closed_at");

-- CreateIndex
CREATE INDEX "table_group_members_table_id_idx" ON "table_group_members"("table_id");

-- CreateIndex
CREATE UNIQUE INDEX "table_group_members_group_id_table_id_key" ON "table_group_members"("group_id", "table_id");

-- AddForeignKey
ALTER TABLE "table_group_members" ADD CONSTRAINT "table_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "table_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_group_members" ADD CONSTRAINT "table_group_members_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

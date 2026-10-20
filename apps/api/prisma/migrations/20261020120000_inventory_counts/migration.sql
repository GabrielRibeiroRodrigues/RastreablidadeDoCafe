-- Inventário (contagem física): contagem por local, itens por lote e, ao aplicar, ajustes no
-- razão. Só cria tabelas novas.

-- CreateEnum
CREATE TYPE "inventory_count_status" AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "location_id" UUID NOT NULL,
    "status" "inventory_count_status" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(3),
    "applied_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "system_quantity" DECIMAL(14,3) NOT NULL,
    "counted_quantity" DECIMAL(14,3),
    "counted_at" TIMESTAMPTZ(3),
    "counted_by_id" UUID,
    "difference" DECIMAL(14,3),
    "adjustment_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_counts_company_id_status_created_at_idx" ON "inventory_counts"("company_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_company_id_id_key" ON "inventory_counts"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_company_id_number_key" ON "inventory_counts"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_items_adjustment_id_key" ON "inventory_count_items"("adjustment_id");

-- CreateIndex
CREATE INDEX "inventory_count_items_company_id_lot_id_idx" ON "inventory_count_items"("company_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_items_count_id_lot_id_key" ON "inventory_count_items"("count_id", "lot_id");

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_company_id_created_by_id_fkey" FOREIGN KEY ("company_id", "created_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_company_id_applied_by_id_fkey" FOREIGN KEY ("company_id", "applied_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_company_id_cancelled_by_id_fkey" FOREIGN KEY ("company_id", "cancelled_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_company_id_count_id_fkey" FOREIGN KEY ("company_id", "count_id") REFERENCES "inventory_counts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_company_id_lot_id_fkey" FOREIGN KEY ("company_id", "lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_company_id_counted_by_id_fkey" FOREIGN KEY ("company_id", "counted_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Uma contagem aberta por local de cada vez (o serviço também confere, travando o local).
CREATE UNIQUE INDEX "inventory_counts_one_open_per_location"
  ON "inventory_counts" ("company_id", "location_id") WHERE "status" = 'OPEN';

-- Situação coerente com as datas e os responsáveis.
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_status_check" CHECK (
  ("status" = 'OPEN' AND "applied_at" IS NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'APPLIED' AND "applied_at" IS NOT NULL AND "applied_by_id" IS NOT NULL AND "cancelled_at" IS NULL)
  OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancelled_by_id" IS NOT NULL
      AND "cancel_reason" IS NOT NULL AND "applied_at" IS NULL)
);

-- Quantidades nunca negativas; contado e quem contou andam juntos.
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_quantities_check" CHECK (
  "system_quantity" >= 0
  AND ("counted_quantity" IS NULL OR "counted_quantity" >= 0)
  AND (("counted_quantity" IS NULL) = ("counted_at" IS NULL))
  AND (("counted_quantity" IS NULL) = ("counted_by_id" IS NULL))
);

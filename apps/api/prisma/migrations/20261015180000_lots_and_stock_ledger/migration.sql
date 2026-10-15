-- CreateEnum
CREATE TYPE "lot_status" AS ENUM ('AVAILABLE', 'QUARANTINE', 'BLOCKED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'CONSUMPTION', 'PRODUCTION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "attachment_status" AS ENUM ('PENDING', 'UPLOADED');

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID,
    "initial_quantity" DECIMAL(14,3) NOT NULL,
    "unit" "unit" NOT NULL,
    "status" "lot_status" NOT NULL DEFAULT 'AVAILABLE',
    "expires_at" DATE,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "harvest" VARCHAR(9),
    "variety" VARCHAR(60),
    "altitude_meters" INTEGER,
    "screen_size" INTEGER,
    "moisture_percent" DECIMAL(4,2),
    "roast_level" "roast_level",
    "cupping_score" DECIMAL(5,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_sequences" (
    "company_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "lot_sequences_pkey" PRIMARY KEY ("company_id","year")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" "movement_type" NOT NULL,
    "lot_id" UUID NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "quantity" DECIMAL(14,3) NOT NULL,
    "user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_ref" VARCHAR(60),
    "reason" TEXT,
    "reversal_of_id" UUID,
    "idempotency_key" VARCHAR(100),
    "request_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "attachment_status" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_at" TIMESTAMPTZ(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lots_company_id_status_idx" ON "lots"("company_id", "status");

-- CreateIndex
CREATE INDEX "lots_company_id_product_id_idx" ON "lots"("company_id", "product_id");

-- CreateIndex
CREATE INDEX "lots_company_id_expires_at_idx" ON "lots"("company_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "lots_company_id_id_key" ON "lots"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lots_company_id_code_key" ON "lots"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversal_of_id_key" ON "stock_movements"("reversal_of_id");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_lot_id_idx" ON "stock_movements"("company_id", "lot_id");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_occurred_at_idx" ON "stock_movements"("company_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_company_id_idempotency_key_key" ON "stock_movements"("company_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_company_id_lot_id_idx" ON "attachments"("company_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_id_key" ON "products"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_id_key" ON "users"("company_id", "id");

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_company_id_product_id_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_sequences" ADD CONSTRAINT "lot_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_lot_id_fkey" FOREIGN KEY ("company_id", "lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_lot_id_fkey" FOREIGN KEY ("company_id", "lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_uploaded_by_id_fkey" FOREIGN KEY ("company_id", "uploaded_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Regras que o Prisma não expressa (escritas à mão) ───────────────

-- Quantidades sempre positivas; a direção vem de origem/destino.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "lots" ADD CONSTRAINT "lots_initial_quantity_positive" CHECK ("initial_quantity" > 0);

-- Toda movimentação tem origem ou destino, e nunca o mesmo local nos dois lados.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_has_location"
  CHECK ("from_location_id" IS NOT NULL OR "to_location_id" IS NOT NULL);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_distinct_locations"
  CHECK ("from_location_id" IS DISTINCT FROM "to_location_id");

-- Faixas de qualidade do café.
ALTER TABLE "lots" ADD CONSTRAINT "lots_screen_size_range" CHECK ("screen_size" BETWEEN 8 AND 20);
ALTER TABLE "lots" ADD CONSTRAINT "lots_moisture_range" CHECK ("moisture_percent" BETWEEN 0 AND 100);
ALTER TABLE "lots" ADD CONSTRAINT "lots_cupping_score_range" CHECK ("cupping_score" BETWEEN 0 AND 100);

-- Razão imutável: correção só por estorno (nova linha). Vale para qualquer cliente do banco,
-- não só para a API (ADR 0007).
CREATE FUNCTION "stock_movements_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed (use a reversal)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_movements_no_update_delete"
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_movements_immutable"();

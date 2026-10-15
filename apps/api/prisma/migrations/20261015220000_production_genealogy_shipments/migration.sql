-- CreateEnum
CREATE TYPE "production_stage" AS ENUM ('PROCESSING', 'ROASTING', 'BLENDING', 'PACKAGING');

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "public_token" VARCHAR(40);

-- CreateTable
CREATE TABLE "document_sequences" (
    "company_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("company_id","kind","year")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "stage" "production_stage" NOT NULL,
    "output_lot_id" UUID NOT NULL,
    "input_mass_kg" DECIMAL(14,3) NOT NULL,
    "output_mass_kg" DECIMAL(14,3),
    "yield_percent" DECIMAL(6,2),
    "loss_kg" DECIMAL(14,3),
    "notes" TEXT,
    "user_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" VARCHAR(100),
    "request_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_origins" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "child_lot_id" UUID NOT NULL,
    "parent_lot_id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_origins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_ref" VARCHAR(60),
    "shipped_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(100),
    "request_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "movement_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_orders_company_id_performed_at_idx" ON "production_orders"("company_id", "performed_at");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_company_id_id_key" ON "production_orders"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_company_id_output_lot_id_key" ON "production_orders"("company_id", "output_lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_company_id_number_key" ON "production_orders"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_company_id_idempotency_key_key" ON "production_orders"("company_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "lot_origins_company_id_child_lot_id_idx" ON "lot_origins"("company_id", "child_lot_id");

-- CreateIndex
CREATE INDEX "lot_origins_company_id_parent_lot_id_idx" ON "lot_origins"("company_id", "parent_lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "lot_origins_production_order_id_parent_lot_id_key" ON "lot_origins"("production_order_id", "parent_lot_id");

-- CreateIndex
CREATE INDEX "shipments_company_id_customer_id_idx" ON "shipments"("company_id", "customer_id");

-- CreateIndex
CREATE INDEX "shipments_company_id_shipped_at_idx" ON "shipments"("company_id", "shipped_at");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_company_id_id_key" ON "shipments"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_company_id_number_key" ON "shipments"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_company_id_idempotency_key_key" ON "shipments"("company_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_items_movement_id_key" ON "shipment_items"("movement_id");

-- CreateIndex
CREATE INDEX "shipment_items_company_id_shipment_id_idx" ON "shipment_items"("company_id", "shipment_id");

-- CreateIndex
CREATE INDEX "shipment_items_company_id_lot_id_idx" ON "shipment_items"("company_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_id_key" ON "customers"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lots_public_token_key" ON "lots"("public_token");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_output_lot_id_fkey" FOREIGN KEY ("company_id", "output_lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_origins" ADD CONSTRAINT "lot_origins_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_origins" ADD CONSTRAINT "lot_origins_company_id_child_lot_id_fkey" FOREIGN KEY ("company_id", "child_lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_origins" ADD CONSTRAINT "lot_origins_company_id_parent_lot_id_fkey" FOREIGN KEY ("company_id", "parent_lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_origins" ADD CONSTRAINT "lot_origins_company_id_production_order_id_fkey" FOREIGN KEY ("company_id", "production_order_id") REFERENCES "production_orders"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_company_id_shipment_id_fkey" FOREIGN KEY ("company_id", "shipment_id") REFERENCES "shipments"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_company_id_lot_id_fkey" FOREIGN KEY ("company_id", "lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Regras escritas à mão ───────────────

ALTER TABLE "lot_origins" ADD CONSTRAINT "lot_origins_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "lot_origins" ADD CONSTRAINT "lot_origins_not_self" CHECK ("child_lot_id" <> "parent_lot_id");
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_input_mass_non_negative" CHECK ("input_mass_kg" >= 0);

-- Genealogia e itens expedidos também são só inclusão: são a prova da rastreabilidade.
CREATE FUNCTION "append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lot_origins_no_update_delete"
  BEFORE UPDATE OR DELETE ON "lot_origins"
  FOR EACH ROW EXECUTE FUNCTION "append_only"();

CREATE TRIGGER "shipment_items_no_update_delete"
  BEFORE UPDATE OR DELETE ON "shipment_items"
  FOR EACH ROW EXECUTE FUNCTION "append_only"();

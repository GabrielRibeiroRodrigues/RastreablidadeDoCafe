-- CreateEnum
CREATE TYPE "non_conformity_type" AS ENUM ('MOISTURE', 'DEFECTS', 'CONTAMINATION', 'PEST', 'PACKAGING', 'OTHER');

-- CreateEnum
CREATE TYPE "non_conformity_status" AS ENUM ('OPEN', 'RELEASED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "recall_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "recall_status" AS ENUM ('OPEN', 'EXECUTING', 'COMPLETED', 'FAILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "recall_step_name" AS ENUM ('BLOCK_LOTS', 'REPORT', 'NOTIFY');

-- CreateEnum
CREATE TYPE "recall_step_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "request_id" VARCHAR(128),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformities" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "lot_id" UUID NOT NULL,
    "type" "non_conformity_type" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "non_conformity_status" NOT NULL DEFAULT 'OPEN',
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "non_conformities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalls" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "origin_lot_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" "recall_severity" NOT NULL,
    "status" "recall_status" NOT NULL DEFAULT 'OPEN',
    "report_key" TEXT,
    "execution_arn" TEXT,
    "last_error" TEXT,
    "created_by_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "closed_by_id" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "closing_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall_steps" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recall_id" UUID NOT NULL,
    "name" "recall_step_name" NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "recall_step_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "error" TEXT,
    "output" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recall_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall_lots" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recall_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "depth" INTEGER NOT NULL,
    "balance" DECIMAL(14,3) NOT NULL,
    "previous_status" "lot_status",
    "blocked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recall_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall_customers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recall_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "shipments_count" INTEGER NOT NULL,
    "shipment_numbers" TEXT[],
    "quantities" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recall_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_entity_type_entity_id_idx" ON "audit_logs"("company_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_user_id_idx" ON "audit_logs"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_action_idx" ON "audit_logs"("company_id", "action");

-- CreateIndex
CREATE INDEX "non_conformities_company_id_lot_id_status_idx" ON "non_conformities"("company_id", "lot_id", "status");

-- CreateIndex
CREATE INDEX "non_conformities_company_id_status_opened_at_idx" ON "non_conformities"("company_id", "status", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_company_id_number_key" ON "non_conformities"("company_id", "number");

-- CreateIndex
CREATE INDEX "recalls_company_id_status_created_at_idx" ON "recalls"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "recalls_company_id_origin_lot_id_idx" ON "recalls"("company_id", "origin_lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_company_id_id_key" ON "recalls"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_company_id_number_key" ON "recalls"("company_id", "number");

-- CreateIndex
CREATE INDEX "recall_steps_company_id_recall_id_idx" ON "recall_steps"("company_id", "recall_id");

-- CreateIndex
CREATE UNIQUE INDEX "recall_steps_recall_id_name_key" ON "recall_steps"("recall_id", "name");

-- CreateIndex
CREATE INDEX "recall_lots_company_id_lot_id_idx" ON "recall_lots"("company_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "recall_lots_recall_id_lot_id_key" ON "recall_lots"("recall_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "recall_customers_recall_id_customer_id_key" ON "recall_customers"("recall_id", "customer_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_company_id_lot_id_fkey" FOREIGN KEY ("company_id", "lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_company_id_opened_by_id_fkey" FOREIGN KEY ("company_id", "opened_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_company_id_resolved_by_id_fkey" FOREIGN KEY ("company_id", "resolved_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_company_id_origin_lot_id_fkey" FOREIGN KEY ("company_id", "origin_lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_company_id_created_by_id_fkey" FOREIGN KEY ("company_id", "created_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_company_id_closed_by_id_fkey" FOREIGN KEY ("company_id", "closed_by_id") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_steps" ADD CONSTRAINT "recall_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_steps" ADD CONSTRAINT "recall_steps_company_id_recall_id_fkey" FOREIGN KEY ("company_id", "recall_id") REFERENCES "recalls"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_lots" ADD CONSTRAINT "recall_lots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_lots" ADD CONSTRAINT "recall_lots_company_id_recall_id_fkey" FOREIGN KEY ("company_id", "recall_id") REFERENCES "recalls"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_lots" ADD CONSTRAINT "recall_lots_company_id_lot_id_fkey" FOREIGN KEY ("company_id", "lot_id") REFERENCES "lots"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_customers" ADD CONSTRAINT "recall_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_customers" ADD CONSTRAINT "recall_customers_company_id_recall_id_fkey" FOREIGN KEY ("company_id", "recall_id") REFERENCES "recalls"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_customers" ADD CONSTRAINT "recall_customers_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Regras escritas à mão ───────────────

-- Auditoria é prova: só inclusão, para qualquer cliente do banco (reaproveita a função da Semana 3).
CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "append_only"();

ALTER TABLE "recall_lots" ADD CONSTRAINT "recall_lots_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "recall_lots" ADD CONSTRAINT "recall_lots_depth_non_negative" CHECK ("depth" >= 0);
ALTER TABLE "recall_customers" ADD CONSTRAINT "recall_customers_shipments_positive" CHECK ("shipments_count" > 0);
ALTER TABLE "recall_steps" ADD CONSTRAINT "recall_steps_attempts_non_negative" CHECK ("attempts" >= 0);

-- Resolução de NC: aberta sem resolução; liberada/descartada com justificativa, autor e data.
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_resolution_consistent" CHECK (
  ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_id" IS NULL)
  OR ("status" <> 'OPEN' AND "resolved_at" IS NOT NULL AND "resolved_by_id" IS NOT NULL
      AND "resolution" IS NOT NULL)
);

-- Recall encerrado sempre tem data e autor.
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_closed_consistent" CHECK (
  "status" <> 'CLOSED' OR ("closed_at" IS NOT NULL AND "closed_by_id" IS NOT NULL)
);

-- No máximo um recall não encerrado por lote de origem.
CREATE UNIQUE INDEX "recalls_one_open_per_origin_lot"
  ON "recalls" ("company_id", "origin_lot_id") WHERE "status" <> 'CLOSED';
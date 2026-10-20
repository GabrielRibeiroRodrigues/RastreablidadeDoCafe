-- Cancelamento de ordem de produção e de expedição: todas as movimentações da operação são
-- estornadas numa transação e a operação fica marcada (painel, relatórios e rastreio a ignoram).
-- Só adiciona colunas anuláveis: linhas existentes continuam válidas (não canceladas).

ALTER TABLE "production_orders"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "cancelled_by_id" UUID;

ALTER TABLE "shipments"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "cancelled_by_id" UUID;

ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_cancelled_by_id_fkey"
  FOREIGN KEY ("company_id", "cancelled_by_id") REFERENCES "users"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_cancelled_by_id_fkey"
  FOREIGN KEY ("company_id", "cancelled_by_id") REFERENCES "users"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Os três campos andam juntos: cancelada tem data, motivo e responsável; ativa não tem nenhum.
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_cancellation_check" CHECK (
  ("cancelled_at" IS NULL AND "cancel_reason" IS NULL AND "cancelled_by_id" IS NULL)
  OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL AND "cancelled_by_id" IS NOT NULL)
);

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_cancellation_check" CHECK (
  ("cancelled_at" IS NULL AND "cancel_reason" IS NULL AND "cancelled_by_id" IS NULL)
  OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL AND "cancelled_by_id" IS NOT NULL)
);

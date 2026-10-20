-- Remoção de anexo enviado por engano: o registro fica (quem, quando, por quê) e sai da lista;
-- o arquivo continua no bucket versionado. Só adiciona: anexos existentes não mudam.
ALTER TYPE "attachment_status" ADD VALUE 'REMOVED';

ALTER TABLE "attachments"
  ADD COLUMN "removed_at" TIMESTAMPTZ(3),
  ADD COLUMN "removed_by_id" UUID,
  ADD COLUMN "remove_reason" TEXT;

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_removed_by_id_fkey"
  FOREIGN KEY ("company_id", "removed_by_id") REFERENCES "users"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Os três campos andam juntos.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_removal_check" CHECK (
  ("removed_at" IS NULL AND "removed_by_id" IS NULL AND "remove_reason" IS NULL)
  OR ("removed_at" IS NOT NULL AND "removed_by_id" IS NOT NULL AND "remove_reason" IS NOT NULL)
);

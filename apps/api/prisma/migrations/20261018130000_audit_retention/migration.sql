-- Retenção da auditoria (docs/recall-qualidade-auditoria.md): UPDATE continua proibido sempre;
-- DELETE só pelo job de retenção, que liga a flag na própria transação, e só para registros com
-- mais de 1 ano (defesa em profundidade contra um engano no job).
CREATE FUNCTION "audit_logs_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('traceflow.audit_retention', true) = 'on'
     AND OLD.created_at < now() - interval '365 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "audit_logs_no_update_delete" ON "audit_logs";

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_guard"();

/** Rótulos da trilha de auditoria. Ações desconhecidas aparecem com a chave crua. */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'lot.received': 'Lote recebido',
  'lot.updated': 'Dados do lote alterados',
  'lot.status_changed': 'Status do lote alterado',
  'movement.created': 'Movimentação registrada',
  'movement.reversed': 'Movimentação estornada',
  'production_order.created': 'Ordem de produção registrada',
  'shipment.created': 'Expedição registrada',
  'company.updated': 'Empresa alterada',
  'label.generated': 'Etiqueta gerada',
  'non_conformity.opened': 'Não conformidade aberta',
  'non_conformity.released': 'Não conformidade liberada',
  'non_conformity.discarded': 'Não conformidade descartada',
  'recall.created': 'Recall criado',
  'recall.started': 'Recall iniciado',
  'recall.retried': 'Recall retomado',
  'recall.executed': 'Recall executado',
  'recall.failed': 'Recall falhou',
  'recall.closed': 'Recall encerrado',
  'http.post': 'Registro criado',
  'http.put': 'Registro alterado',
  'http.patch': 'Registro alterado',
  'http.delete': 'Registro removido',
};

/** Filtro por grupo: a API aceita prefixo terminado em ponto (`recall.`). */
export const AUDIT_ACTION_GROUPS: Record<string, string> = {
  'lot.': 'Lotes — todas',
  'movement.': 'Movimentações — todas',
  'production_order.': 'Produção — todas',
  'shipment.': 'Expedição — todas',
  'non_conformity.': 'Não conformidades — todas',
  'recall.': 'Recall — todas',
  'http.': 'Genéricas (cadastros etc.)',
};

/** Tipos gravados pelos serviços e, no singular/plural da rota, pelo interceptor genérico. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  lot: 'Lote',
  lots: 'Lote',
  movement: 'Movimentação',
  movements: 'Movimentação',
  receipts: 'Recebimento',
  production_order: 'Ordem de produção',
  'production-orders': 'Ordem de produção',
  shipment: 'Expedição',
  shipments: 'Expedição',
  non_conformity: 'Não conformidade',
  'non-conformities': 'Não conformidade',
  recall: 'Recall',
  recalls: 'Recall',
  company: 'Empresa',
  companies: 'Empresa',
  products: 'Produto',
  suppliers: 'Fornecedor',
  customers: 'Cliente',
  locations: 'Local',
  imports: 'Importação',
  attachments: 'Anexo',
};

/** Tipos oferecidos no filtro (os explícitos dos serviços + cadastros do interceptor). */
export const AUDIT_ENTITY_FILTER: Record<string, string> = {
  lot: 'Lote',
  movement: 'Movimentação',
  production_order: 'Ordem de produção',
  shipment: 'Expedição',
  non_conformity: 'Não conformidade',
  recall: 'Recall',
  company: 'Empresa',
  products: 'Produto',
  suppliers: 'Fornecedor',
  customers: 'Cliente',
  locations: 'Local',
  imports: 'Importação',
};

const ENTITY_ROUTES: Record<string, string> = {
  lot: '/lotes',
  lots: '/lotes',
  production_order: '/producao',
  'production-orders': '/producao',
  shipment: '/expedicao',
  shipments: '/expedicao',
  non_conformity: '/qualidade',
  'non-conformities': '/qualidade',
  recall: '/recall',
  recalls: '/recall',
};

export const actionLabel = (action: string): string => AUDIT_ACTION_LABELS[action] ?? action;
export const entityLabel = (type: string): string => AUDIT_ENTITY_LABELS[type] ?? type;

/** Link do registro auditado (só para entidades com página de detalhe). */
export function entityHref(type: string, id: string | null): string | null {
  const base = ENTITY_ROUTES[type];
  return base && id ? `${base}/${id}` : null;
}

/** Rótulos dos campos mais comuns em `before`/`after`. */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  lotStatus: 'Status do lote',
  reason: 'Motivo',
  justification: 'Justificativa',
  notes: 'Notas',
  name: 'Nome',
  expiresAt: 'Validade',
  quantity: 'Quantidade',
  type: 'Tipo',
  description: 'Descrição',
  severity: 'Severidade',
  route: 'Rota',
  method: 'Método',
  losses: 'Perdas',
};

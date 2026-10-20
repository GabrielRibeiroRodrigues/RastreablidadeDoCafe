/**
 * Regras de isolamento por empresa aplicadas a cada operação do Prisma (ADR 0004).
 * Função pura: recebe os argumentos da consulta e devolve os argumentos escopados.
 */

/** Modelos com coluna `company_id`. */
export const TENANT_MODELS = new Set([
  'User',
  'Product',
  'Supplier',
  'Customer',
  'Location',
  'Lot',
  'StockMovement',
  'Attachment',
  'ProductionOrder',
  'LotOrigin',
  'Shipment',
  'ShipmentItem',
  'AuditLog',
  'NonConformity',
  'Recall',
  'RecallStep',
  'RecallLot',
  'RecallCustomer',
  'Notification',
]);

/** Razão, genealogia, itens expedidos e auditoria: só inclusão (o banco também bloqueia por trigger). */
export const APPEND_ONLY_MODELS = new Set([
  'StockMovement',
  'LotOrigin',
  'ShipmentItem',
  'AuditLog',
]);
const MUTATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/** O próprio tenant: só pode ler/alterar a empresa do contexto, nunca criar ou apagar. */
export const COMPANY_MODEL = 'Company';

type Args = Record<string, unknown>;

export class TenantScopeError extends Error {}

/** Operações cujo `where` é um WhereUniqueInput: o filtro entra no mesmo nível da chave única. */
const UNIQUE_WHERE = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);

/** Operações cujo `where` é um WhereInput comum. */
const LIST_WHERE = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

const CREATE = new Set(['create', 'createMany', 'createManyAndReturn']);

/** Operações que gravam `data` e não podem mudar a empresa do registro. */
const UPDATE_DATA = new Set(['update', 'updateMany', 'updateManyAndReturn']);

export function scopeArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  companyId: string,
): Args {
  if (model === COMPANY_MODEL) {
    return scopeCompany(operation, args ?? {}, companyId);
  }
  if (!TENANT_MODELS.has(model)) {
    throw new TenantScopeError(`Model ${model} is not tenant-aware; use an explicit client`);
  }
  if (APPEND_ONLY_MODELS.has(model) && MUTATIONS.has(operation)) {
    throw new TenantScopeError(
      `${model} is append-only: ${operation} is not allowed (use a reversal)`,
    );
  }

  const scoped: Args = { ...args };

  if (UNIQUE_WHERE.has(operation)) {
    scoped['where'] = { ...(args?.['where'] as Args), companyId };
  } else if (LIST_WHERE.has(operation)) {
    scoped['where'] = andCompany(args?.['where'], { companyId });
  } else if (!CREATE.has(operation)) {
    throw new TenantScopeError(`Operation ${operation} is not supported on tenant models`);
  }

  if (CREATE.has(operation)) {
    scoped['data'] = mapData(args?.['data'], (data) => withCompany(data, companyId));
  }
  if (UPDATE_DATA.has(operation)) {
    scoped['data'] = withoutCompany(args?.['data']);
  }
  if (operation === 'upsert') {
    scoped['create'] = withCompany(args?.['create'], companyId);
    scoped['update'] = withoutCompany(args?.['update']);
  }

  return scoped;
}

function scopeCompany(operation: string, args: Args, companyId: string): Args {
  if (UNIQUE_WHERE.has(operation) && operation !== 'delete' && operation !== 'upsert') {
    // AND (e não sobrescrever o id): pedir outra empresa não encontra nada, em vez de cair na própria.
    const where = (args['where'] ?? {}) as Args;
    const scoped: Args = {
      ...args,
      where: { ...where, AND: [...asArray(where['AND']), { id: companyId }] },
    };
    if (operation === 'update') scoped['data'] = withoutCompanyIdentity(args['data']);
    return scoped;
  }
  if (LIST_WHERE.has(operation) && !operation.startsWith('delete')) {
    const scoped: Args = { ...args, where: andCompany(args['where'], { id: companyId }) };
    if (operation.startsWith('update')) scoped['data'] = withoutCompanyIdentity(args['data']);
    return scoped;
  }
  throw new TenantScopeError(`Operation ${operation} on Company is not allowed in tenant scope`);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function andCompany(where: unknown, filter: Args): Args {
  return where ? { AND: [where, filter] } : filter;
}

function mapData(data: unknown, fn: (item: unknown) => Args): Args | Args[] {
  return Array.isArray(data) ? data.map(fn) : fn(data);
}

/** Força a empresa do contexto, descartando qualquer `companyId`/`company` vindo do chamador. */
function withCompany(data: unknown, companyId: string): Args {
  const { company: _company, ...rest } = (data ?? {}) as Args;
  return { ...rest, companyId };
}

/** Um registro nunca muda de empresa. */
function withoutCompany(data: unknown): Args {
  const { company: _company, companyId: _companyId, ...rest } = (data ?? {}) as Args;
  return rest;
}

function withoutCompanyIdentity(data: unknown): Args {
  const { id: _id, ...rest } = (data ?? {}) as Args;
  return rest;
}

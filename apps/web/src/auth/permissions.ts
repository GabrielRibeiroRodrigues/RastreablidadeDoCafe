import type { Role } from '@traceflow/shared';
import { useAuth } from './auth-context';

export interface CatalogPermissions {
  /** Criar e editar cadastros (admin e operador). */
  canWrite: boolean;
  /** Ativar e desativar cadastros (só admin). */
  canToggleActive: boolean;
}

/**
 * O que a UI mostra para cada perfil. É só conveniência: a API aplica as mesmas regras.
 * Auditor: somente leitura.
 */
export function catalogPermissions(roles: readonly Role[]): CatalogPermissions {
  const isAdmin = roles.includes('admin');
  return {
    canWrite: isAdmin || roles.includes('operator'),
    canToggleActive: isAdmin,
  };
}

export function useCatalogPermissions(): CatalogPermissions {
  const { user } = useAuth();
  return catalogPermissions(user?.roles ?? []);
}

export interface InventoryPermissions {
  /** Receber, movimentar, editar dados do lote e anexar arquivos (admin e operador). */
  canOperate: boolean;
  /** Ajuste de inventário (só admin). */
  canAdjust: boolean;
  /** Estorno de movimentação (só admin). */
  canReverse: boolean;
  /** Status que o perfil pode definir: operador só põe em quarentena. */
  settableStatuses: Array<'AVAILABLE' | 'QUARANTINE' | 'BLOCKED'>;
}

/** Regras de estoque na UI (a API aplica as mesmas). Auditor: somente leitura. */
export function inventoryPermissions(roles: readonly Role[]): InventoryPermissions {
  const isAdmin = roles.includes('admin');
  const canOperate = isAdmin || roles.includes('operator');
  let settableStatuses: InventoryPermissions['settableStatuses'] = [];
  if (isAdmin) settableStatuses = ['AVAILABLE', 'QUARANTINE', 'BLOCKED'];
  else if (canOperate) settableStatuses = ['QUARANTINE'];
  return { canOperate, canAdjust: isAdmin, canReverse: isAdmin, settableStatuses };
}

export function useInventoryPermissions(): InventoryPermissions {
  const { user } = useAuth();
  return inventoryPermissions(user?.roles ?? []);
}

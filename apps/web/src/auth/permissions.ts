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

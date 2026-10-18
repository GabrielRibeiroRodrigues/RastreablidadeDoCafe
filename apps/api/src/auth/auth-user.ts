import { isRole, type Role as AppRole } from '@traceflow/shared';
import { Role } from '../generated/prisma/client.js';

/** Usuário autenticado, anexado a `request.user` pelo JwtStrategy. */
export interface AuthUser {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  /** Perfil do banco (fonte de verdade, ADR 0012); os grupos do Cognito são mantidos iguais. */
  roles: AppRole[];
}

const DB_TO_APP_ROLE: Record<Role, AppRole> = {
  [Role.ADMIN]: 'admin',
  [Role.OPERATOR]: 'operator',
  [Role.AUDITOR]: 'auditor',
};

/** Converte o perfil provisionado no banco no nome do grupo do Cognito. */
export function toAppRole(role: Role): AppRole {
  return DB_TO_APP_ROLE[role];
}

/** Mantém só os grupos que são perfis conhecidos (o Cognito pode ter outros grupos). */
export function rolesFromGroups(groups: unknown): AppRole[] {
  return Array.isArray(groups) ? groups.filter(isRole) : [];
}

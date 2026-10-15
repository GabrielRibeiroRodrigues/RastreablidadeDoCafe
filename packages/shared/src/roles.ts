/** Perfis de acesso. Espelham os grupos do Cognito. */
export const ROLES = ['admin', 'operator', 'auditor'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

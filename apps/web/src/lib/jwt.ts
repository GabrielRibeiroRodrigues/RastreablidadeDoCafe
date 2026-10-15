import { isRole, type Role } from '@traceflow/shared';

export type JwtPayload = Record<string, unknown>;

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decodifica o payload de um JWT **sem verificar a assinatura**. Serve apenas
 * para a UI (perfis, expiração); quem valida o token é a API.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(payload));
    return typeof parsed === 'object' && parsed !== null ? (parsed as JwtPayload) : null;
  } catch {
    return null;
  }
}

/** Perfis do usuário a partir do claim `cognito:groups`, ignorando grupos desconhecidos. */
export function extractRoles(token: string): Role[] {
  const groups = decodeJwtPayload(token)?.['cognito:groups'];
  return Array.isArray(groups) ? groups.filter(isRole) : [];
}

/** `true` se o claim `exp` já passou (com margem de segurança). */
export function isTokenExpired(token: string, nowMs = Date.now(), skewSeconds = 30): boolean {
  const exp = decodeJwtPayload(token)?.exp;
  if (typeof exp !== 'number') return false;
  return exp - skewSeconds <= nowMs / 1000;
}

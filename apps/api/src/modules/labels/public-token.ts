import { randomBytes } from 'node:crypto';

/**
 * Token do QR code: 16 bytes aleatórios (128 bits) em base64url → 22 caracteres seguros para URL.
 * Não deriva do id nem do código do lote, então não dá para adivinhar ou enumerar lotes.
 */
export function generatePublicToken(): string {
  return randomBytes(16).toString('base64url');
}

/** Formato aceito na rota pública (filtra lixo antes de ir ao banco). */
export const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,40}$/;

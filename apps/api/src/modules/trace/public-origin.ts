import { SupplierType } from '../../generated/prisma/client.js';
import type { TraceSupplier } from './trace.dto.js';

/** Origem como pode aparecer fora da empresa: etiqueta impressa e página pública de rastreio. */
export interface PublicOrigin {
  /** Nome da fazenda, cooperativa ou empresa — nunca o nome pessoal de um produtor (LGPD). */
  name: string | null;
  region: string | null;
  city: string | null;
  state: string | null;
  altitudeMeters: number | null;
}

/**
 * Reduz o fornecedor ao que é publicável. Produtor rural é pessoa física: o nome dele não sai da
 * empresa — só o da fazenda, se houver; sem fazenda, fica só a região/cidade. Documento, contato e
 * ids nunca são copiados.
 */
export function toPublicOrigin(supplier: TraceSupplier): PublicOrigin {
  const name =
    supplier.farmName?.trim() ||
    (supplier.type === SupplierType.PRODUCER ? null : supplier.name.trim() || null);
  return {
    name,
    region: supplier.region,
    city: supplier.city,
    state: supplier.state,
    altitudeMeters: supplier.altitudeMeters,
  };
}

/** "Mantiqueira de Minas · Carmo de Minas/MG" (partes ausentes são omitidas). */
export function formatPlace(origin: Pick<PublicOrigin, 'region' | 'city' | 'state'>): string {
  const city = [origin.city, origin.state].filter(Boolean).join('/');
  return [origin.region, city].filter(Boolean).join(' · ');
}

/**
 * Remove origens repetidas. Depois de anonimizar, dois produtores diferentes da mesma cidade
 * viram a mesma origem pública — e aparecem uma vez só.
 */
export function uniqueOrigins(origins: PublicOrigin[]): PublicOrigin[] {
  const seen = new Map<string, PublicOrigin>();
  for (const origin of origins) {
    const key = [origin.name, origin.region, origin.city, origin.state].join('|');
    if (!seen.has(key)) seen.set(key, origin);
  }
  return [...seen.values()];
}

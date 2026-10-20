import { Injectable } from '@nestjs/common';
import { businessYear } from '../../common/time/business-time.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { TenantTransaction } from '../../tenancy/tenant-prisma.service.js';

/** Tipos de documento numerados por empresa e ano. */
export const DOCUMENT_KINDS = {
  productionOrder: { kind: 'production_order', prefix: 'OP' },
  shipment: { kind: 'shipment', prefix: 'EXP' },
  nonConformity: { kind: 'non_conformity', prefix: 'NC' },
  recall: { kind: 'recall', prefix: 'RC' },
} as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[keyof typeof DOCUMENT_KINDS];

/**
 * Números de documento `PREFIXO-ANO-NNNNNN` (OP-2026-000001, EXP-2026-000001).
 * Mesmo mecanismo do código de lote: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, atômico
 * dentro da transação e sem buracos em rollback.
 */
@Injectable()
export class DocumentNumberService {
  async next(tx: TenantTransaction, doc: DocumentKind, at: Date = new Date()): Promise<string> {
    const year = businessYear(at);
    const [row] = await tx.sql<Array<{ last_value: number }>>(
      (companyId) => Prisma.sql`
        INSERT INTO document_sequences (company_id, kind, year, last_value)
        VALUES (${companyId}::uuid, ${doc.kind}, ${year}, 1)
        ON CONFLICT (company_id, kind, year)
        DO UPDATE SET last_value = document_sequences.last_value + 1
        RETURNING last_value`,
    );
    if (!row) throw new Error('Document sequence did not return a value');
    return `${doc.prefix}-${year}-${String(row.last_value).padStart(6, '0')}`;
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { TenantTransaction } from '../../tenancy/tenant-prisma.service.js';

/**
 * Códigos de lote `PREFIXO-ANO-NNNNNN` (ex.: CAF-2026-000123), sequenciais por empresa e ano.
 *
 * O incremento é um único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`: o Postgres trava a
 * linha da sequência até o fim da transação, então requisições simultâneas recebem números
 * distintos — e, se a transação falhar, o número volta (sem buracos por rollback).
 */
@Injectable()
export class LotCodeService {
  async next(tx: TenantTransaction, prefix: string, at: Date = new Date()): Promise<string> {
    const year = at.getUTCFullYear();
    const [row] = await tx.sql<Array<{ last_value: number }>>(
      (companyId) => Prisma.sql`
        INSERT INTO lot_sequences (company_id, year, last_value)
        VALUES (${companyId}::uuid, ${year}, 1)
        ON CONFLICT (company_id, year)
        DO UPDATE SET last_value = lot_sequences.last_value + 1
        RETURNING last_value`,
    );
    if (!row) throw new Error('Lot sequence did not return a value');
    return `${prefix}-${year}-${String(row.last_value).padStart(6, '0')}`;
  }
}

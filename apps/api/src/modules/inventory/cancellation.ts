import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { trim } from '../../common/http/transforms.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { TenantTransaction } from '../../tenancy/tenant-prisma.service.js';
import { UserSummary } from './inventory.dto.js';

/**
 * Cancelamento de uma operação inteira (ordem de produção, expedição): estorna todas as suas
 * movimentações numa transação e marca a operação. Movimentações nunca são apagadas.
 */
export class CancelOperationDto {
  @ApiProperty({ example: 'Ordem lançada com o lote errado' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class CancellationResponse {
  @ApiProperty() cancelledAt!: Date;
  @ApiProperty({ example: 'Ordem lançada com o lote errado' }) reason!: string;
  @ApiProperty({ type: UserSummary }) user!: UserSummary;
}

/** Linha com os campos de cancelamento → resposta (ou null se a operação vale). */
export function toCancellation(row: {
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledBy: { id: string; name: string } | null;
}): CancellationResponse | null {
  if (!row.cancelledAt || !row.cancelReason || !row.cancelledBy) return null;
  return { cancelledAt: row.cancelledAt, reason: row.cancelReason, user: row.cancelledBy };
}

interface LockedOperation {
  number: string;
  cancelled_at: Date | null;
}

/**
 * Trava a operação até o fim da transação: dois cancelamentos simultâneos ficam em fila e o
 * segundo vê `cancelled_at` preenchido. 404 se não existir (ou for de outra empresa).
 */
export async function lockRow(
  tx: TenantTransaction,
  table: 'production_orders' | 'shipments',
  id: string,
): Promise<LockedOperation> {
  const rows = await tx.sql<LockedOperation[]>((companyId) =>
    table === 'production_orders'
      ? Prisma.sql`
          SELECT number, cancelled_at FROM production_orders
          WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid
          FOR UPDATE`
      : Prisma.sql`
          SELECT number, cancelled_at FROM shipments
          WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid
          FOR UPDATE`,
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('Resource not found.');
  return row;
}

export const CancellationProblems = {
  alreadyCancelled: (document: string) =>
    new DomainProblemException(
      '/problems/already-cancelled',
      `${document} was already cancelled.`,
      HttpStatus.CONFLICT,
      { document },
    ),

  /** Estorno avulso de uma movimentação que faz parte de uma ordem de produção. */
  useCancellation: (document: string) =>
    new DomainProblemException(
      '/problems/use-cancellation',
      `This movement belongs to ${document}; cancel the whole order instead.`,
      HttpStatus.CONFLICT,
      { document },
    ),
};

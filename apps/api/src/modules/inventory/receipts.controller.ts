import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators.js';
import { LotDetailResponse } from './inventory.dto.js';
import { IDEMPOTENCY_HEADER, idempotencyFor } from './idempotency.js';
import { CreateReceiptDto } from './receipts.dto.js';
import { ReceiptsService } from './receipts.service.js';

export const IDEMPOTENCY_HEADER_DOC = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Chave única do cliente (8–100 caracteres). Repetir a requisição com a mesma chave devolve o ' +
    'resultado original (header `Idempotent-Replayed: true`); com outro corpo, 422.',
};

@ApiTags('receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** Recebimento de fornecedor: gera o código do lote e registra a entrada no local. */
  @Post()
  @Roles('admin', 'operator')
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ type: LotDetailResponse })
  @ApiConflictResponse({ description: 'Produto inativo ou local inativo' })
  @ApiUnprocessableEntityResponse({ description: 'Idempotency-Key reutilizada com outro corpo' })
  async create(
    @Body() dto: CreateReceiptDto,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LotDetailResponse> {
    const { lot, replayed } = await this.receipts.receive(dto, idempotencyFor(key, dto));
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return lot;
  }
}

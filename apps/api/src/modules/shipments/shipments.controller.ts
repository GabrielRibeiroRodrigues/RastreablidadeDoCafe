import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { IDEMPOTENCY_HEADER, idempotencyFor } from '../inventory/idempotency.js';
import { IDEMPOTENCY_HEADER_DOC } from '../inventory/receipts.controller.js';
import {
  CreateShipmentDto,
  ListShipmentsQueryDto,
  ShipmentDetailResponse,
  ShipmentResponse,
} from './shipments.dto.js';
import { ShipmentsService } from './shipments.service.js';

/** Expedição para clientes. Sem PATCH/DELETE: correção é pelo estorno da saída do item. */
@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @ApiPageResponse(ShipmentResponse)
  list(@Query() query: ListShipmentsQueryDto): Promise<Page<ShipmentResponse>> {
    return this.shipments.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ShipmentDetailResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ShipmentDetailResponse> {
    return this.shipments.get(id);
  }

  /** Gera o número EXP e uma saída (ISSUE) por item, tudo ou nada. */
  @Post()
  @Roles('admin', 'operator')
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ type: ShipmentDetailResponse })
  @ApiBadRequestResponse({ description: 'Corpo inválido ou par (lote, local) repetido' })
  @ApiNotFoundResponse({ description: 'Cliente, lote ou local não encontrado' })
  @ApiConflictResponse({
    description: 'Cliente inativo, saldo insuficiente ou lote bloqueado/em quarentena',
  })
  @ApiUnprocessableEntityResponse({ description: 'Idempotency-Key reutilizada com outro corpo' })
  async create(
    @Body() dto: CreateShipmentDto,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ShipmentDetailResponse> {
    const { shipment, replayed } = await this.shipments.create(dto, idempotencyFor(key, dto));
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return shipment;
  }
}

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
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { IDEMPOTENCY_HEADER, idempotencyFor } from '../inventory/idempotency.js';
import { IDEMPOTENCY_HEADER_DOC } from '../inventory/receipts.controller.js';
import {
  CreateProductionOrderDto,
  ListProductionOrdersQueryDto,
  ProductionOrderResponse,
} from './production.dto.js';
import { ProductionService } from './production.service.js';

@ApiTags('production')
@ApiBearerAuth()
@Controller('production-orders')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  @ApiPageResponse(ProductionOrderResponse)
  list(@Query() query: ListProductionOrdersQueryDto): Promise<Page<ProductionOrderResponse>> {
    return this.production.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductionOrderResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOrderResponse> {
    return this.production.get(id);
  }

  /** Executa a produção: consome os insumos, gera o lote e grava a genealogia — tudo ou nada. */
  @Post()
  @Roles('admin', 'operator')
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ type: ProductionOrderResponse })
  @ApiBadRequestResponse({ description: 'Etapa incompatível com os produtos, saída > entrada' })
  @ApiConflictResponse({ description: 'Saldo insuficiente ou insumo bloqueado/em quarentena' })
  async create(
    @Body() dto: CreateProductionOrderDto,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductionOrderResponse> {
    const { order, replayed } = await this.production.create(dto, idempotencyFor(key, dto));
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return order;
  }
}

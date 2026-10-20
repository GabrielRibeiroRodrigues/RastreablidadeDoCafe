import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { CancelOperationDto } from '../inventory/cancellation.js';
import {
  AddCountItemDto,
  CountItemDto,
  CreateInventoryCountDto,
  InventoryCountDetailResponse,
  InventoryCountResponse,
  ListInventoryCountsQueryDto,
} from './inventory-counts.dto.js';
import { InventoryCountsService } from './inventory-counts.service.js';

/** Inventário (contagem física): abrir, contar, aplicar as diferenças como ajustes ou cancelar. */
@ApiTags('inventory-counts')
@ApiBearerAuth()
@Controller('inventory-counts')
export class InventoryCountsController {
  constructor(private readonly counts: InventoryCountsService) {}

  @Get()
  @ApiPageResponse(InventoryCountResponse)
  list(@Query() query: ListInventoryCountsQueryDto): Promise<Page<InventoryCountResponse>> {
    return this.counts.list(query);
  }

  /** Abre a contagem de um local com os lotes que têm saldo ali. Uma aberta por local. */
  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: InventoryCountDetailResponse })
  @ApiNotFoundResponse({ description: 'Local não encontrado' })
  @ApiConflictResponse({ description: 'Já existe contagem aberta no local' })
  create(@Body() dto: CreateInventoryCountDto): Promise<InventoryCountDetailResponse> {
    return this.counts.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: InventoryCountDetailResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryCountDetailResponse> {
    return this.counts.get(id);
  }

  /** Registra (ou corrige) a quantidade contada de um lote da lista. */
  @Put(':id/items/:itemId')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: InventoryCountDetailResponse })
  @ApiConflictResponse({ description: 'Contagem já aplicada ou cancelada' })
  countItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CountItemDto,
  ): Promise<InventoryCountDetailResponse> {
    return this.counts.countItem(id, itemId, dto);
  }

  /** Inclui um lote encontrado no local que não estava na lista. */
  @Post(':id/items')
  @HttpCode(200)
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: InventoryCountDetailResponse })
  @ApiConflictResponse({ description: 'Lote já está na contagem ou contagem fechada' })
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCountItemDto,
  ): Promise<InventoryCountDetailResponse> {
    return this.counts.addItem(id, dto);
  }

  /** Lança as diferenças como ajustes no razão. Exige todos os lotes contados. */
  @Post(':id/apply')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: InventoryCountDetailResponse })
  @ApiConflictResponse({ description: 'Contagem incompleta, já aplicada ou cancelada' })
  apply(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryCountDetailResponse> {
    return this.counts.apply(id);
  }

  /** Cancela sem lançar nada no estoque. */
  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: InventoryCountDetailResponse })
  @ApiConflictResponse({ description: 'Contagem já aplicada ou cancelada' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOperationDto,
  ): Promise<InventoryCountDetailResponse> {
    return this.counts.cancel(id, dto.reason);
  }
}

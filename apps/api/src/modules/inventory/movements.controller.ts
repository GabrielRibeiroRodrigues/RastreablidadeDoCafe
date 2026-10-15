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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { MovementResponse } from './inventory.dto.js';
import { IDEMPOTENCY_HEADER, idempotencyFor } from './idempotency.js';
import { CreateMovementDto, ListMovementsQueryDto, ReverseMovementDto } from './movements.dto.js';
import { MovementsService } from './movements.service.js';
import { IDEMPOTENCY_HEADER_DOC } from './receipts.controller.js';

/** Razão de estoque: só inclusão. Não existe PATCH nem DELETE — correção é por estorno. */
@ApiTags('movements')
@ApiBearerAuth()
@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  @ApiPageResponse(MovementResponse)
  list(@Query() query: ListMovementsQueryDto): Promise<Page<MovementResponse>> {
    return this.movements.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: MovementResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MovementResponse> {
    return this.movements.get(id);
  }

  /** Saída, transferência, consumo (admin/operador) ou ajuste (só admin, com motivo). */
  @Post()
  @Roles('admin', 'operator')
  @ApiHeader(IDEMPOTENCY_HEADER_DOC)
  @ApiCreatedResponse({ type: MovementResponse })
  @ApiConflictResponse({ description: 'Saldo insuficiente ou lote bloqueado/em quarentena' })
  async create(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthUser,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MovementResponse> {
    const { movement, replayed } = await this.movements.create(dto, user, idempotencyFor(key, dto));
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return movement;
  }

  @Post(':id/reverse')
  @Roles('admin')
  @ApiCreatedResponse({ type: MovementResponse })
  @ApiConflictResponse({ description: 'Já estornada, é um estorno, ou o saldo não comporta' })
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseMovementDto,
  ): Promise<MovementResponse> {
    return this.movements.reverse(id, dto);
  }
}

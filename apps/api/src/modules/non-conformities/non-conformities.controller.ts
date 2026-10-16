import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
import {
  ListNonConformitiesQueryDto,
  NonConformityResponse,
  OpenNonConformityDto,
  ResolveNonConformityDto,
} from './non-conformities.dto.js';
import { NonConformitiesService } from './non-conformities.service.js';

/** Não conformidades de qualidade: abrir (quarentena), liberar ou descartar. Sem exclusão. */
@ApiTags('non-conformities')
@ApiBearerAuth()
@Controller('non-conformities')
export class NonConformitiesController {
  constructor(private readonly ncs: NonConformitiesService) {}

  @Get()
  @ApiPageResponse(NonConformityResponse)
  list(@Query() query: ListNonConformitiesQueryDto): Promise<Page<NonConformityResponse>> {
    return this.ncs.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: NonConformityResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<NonConformityResponse> {
    return this.ncs.get(id);
  }

  /** Abre a NC e coloca o lote em quarentena (se estava disponível). */
  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: NonConformityResponse })
  @ApiNotFoundResponse({ description: 'Lote não encontrado' })
  open(@Body() dto: OpenNonConformityDto): Promise<NonConformityResponse> {
    return this.ncs.open(dto);
  }

  /** Libera: o lote volta a disponível se não houver outra NC aberta nem recall em aberto. */
  @Post(':id/release')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: NonConformityResponse })
  @ApiConflictResponse({ description: 'NC já resolvida ou lote sob recall' })
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveNonConformityDto,
  ): Promise<NonConformityResponse> {
    return this.ncs.release(id, dto);
  }

  /** Descarta: baixa todo o saldo do lote por ajuste de perda; o lote termina consumido. */
  @Post(':id/discard')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: NonConformityResponse })
  @ApiConflictResponse({ description: 'NC já resolvida' })
  discard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveNonConformityDto,
  ): Promise<NonConformityResponse> {
    return this.ncs.discard(id, dto);
  }
}

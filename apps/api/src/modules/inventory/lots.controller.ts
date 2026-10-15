import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { LotDetailResponse, LotResponse } from './inventory.dto.js';
import { ChangeLotStatusDto, ListLotsQueryDto, UpdateLotDto } from './lots.dto.js';
import { LotsService } from './lots.service.js';

/** Lotes: criados pelo recebimento (e, na Semana 3, pela produção). Não há exclusão. */
@ApiTags('lots')
@ApiBearerAuth()
@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  @ApiPageResponse(LotResponse)
  list(@Query() query: ListLotsQueryDto): Promise<Page<LotResponse>> {
    return this.lots.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: LotDetailResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LotDetailResponse> {
    return this.lots.get(id);
  }

  /** Corrige dados de qualidade/validade. Código, produto e quantidades não mudam. */
  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: LotDetailResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLotDto,
  ): Promise<LotDetailResponse> {
    return this.lots.update(id, dto);
  }

  @Patch(':id/status')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: LotDetailResponse })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLotStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<LotDetailResponse> {
    return this.lots.changeStatus(id, dto, user);
  }
}

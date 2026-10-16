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
  CloseRecallDto,
  CreateRecallDto,
  ListRecallsQueryDto,
  RecallDetailResponse,
  RecallReportResponse,
  RecallResponse,
  RecallSimulationResponse,
  SimulateRecallDto,
} from './recalls.dto.js';
import { RecallsService } from './recalls.service.js';

@ApiTags('recalls')
@ApiBearerAuth()
@Controller('recalls')
export class RecallsController {
  constructor(private readonly recalls: RecallsService) {}

  /** Simulação: lotes afetados (com saldo), expedições e clientes. Não grava nada. */
  @Post('simulate')
  @HttpCode(200)
  @Roles('admin', 'operator', 'auditor')
  @ApiOkResponse({ type: RecallSimulationResponse })
  @ApiNotFoundResponse({ description: 'Lote não encontrado' })
  simulate(@Body() dto: SimulateRecallDto): Promise<RecallSimulationResponse> {
    return this.recalls.simulate(dto.lotId);
  }

  @Get()
  @ApiPageResponse(RecallResponse)
  list(@Query() query: ListRecallsQueryDto): Promise<Page<RecallResponse>> {
    return this.recalls.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: RecallDetailResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RecallDetailResponse> {
    return this.recalls.get(id);
  }

  /** Cria e executa: bloqueia os lotes, gera o relatório PDF e notifica. */
  @Post()
  @Roles('admin')
  @ApiCreatedResponse({ type: RecallDetailResponse })
  @ApiConflictResponse({ description: 'Já existe recall aberto para o lote' })
  create(@Body() dto: CreateRecallDto): Promise<RecallDetailResponse> {
    return this.recalls.create(dto);
  }

  /** Retoma um recall que falhou a partir da etapa que falhou. */
  @Post(':id/retry')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: RecallDetailResponse })
  @ApiConflictResponse({ description: 'Recall não está OPEN nem FAILED' })
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<RecallDetailResponse> {
    return this.recalls.retry(id);
  }

  /** Encerra com notas. Os lotes continuam bloqueados (liberação é explícita, lote a lote). */
  @Post(':id/close')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: RecallDetailResponse })
  @ApiConflictResponse({ description: 'Recall não está COMPLETED nem FAILED' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseRecallDto,
  ): Promise<RecallDetailResponse> {
    return this.recalls.close(id, dto);
  }

  /** URL pré-assinada (curta duração) do relatório PDF. */
  @Get(':id/report')
  @ApiOkResponse({ type: RecallReportResponse })
  @ApiNotFoundResponse({ description: 'Recall não encontrado ou relatório ainda não gerado' })
  report(@Param('id', ParseUUIDPipe) id: string): Promise<RecallReportResponse> {
    return this.recalls.reportUrl(id);
  }
}

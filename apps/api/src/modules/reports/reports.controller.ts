import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  LotsReportQueryDto,
  MovementsReportQueryDto,
  ProductionReportQueryDto,
  ShipmentsReportQueryDto,
  StockReportQueryDto,
} from './reports.dto.js';
import { REPORT_MAX_ROWS, ReportsService, type CsvReport } from './reports.service.js';

const CSV_TYPE = 'text/csv; charset=utf-8';

const CSV_RESPONSE = {
  description:
    `CSV para Excel pt-BR (UTF-8 com BOM, separador ";", decimal com vírgula). ` +
    `Máximo de ${REPORT_MAX_ROWS} linhas; se cortado, vem o header X-Report-Truncated: true.`,
  content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
};

/** Relatórios para download (todos os perfis). */
@ApiTags('reports')
@ApiBearerAuth()
@ApiProduces('text/csv')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Posição de estoque (mesmos filtros de `GET /stock`). */
  /** Lotes com os mesmos filtros da tela Lotes (saldo, situação, validade, qualidade). */
  @Get('lots.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse(CSV_RESPONSE)
  async lots(
    @Query() query: LotsReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.reports.lotsReport(query));
  }

  @Get('stock.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse(CSV_RESPONSE)
  async stock(
    @Query() query: StockReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.reports.stockReport(query));
  }

  /** Movimentações do razão, em ordem cronológica. */
  @Get('movements.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse(CSV_RESPONSE)
  async movements(
    @Query() query: MovementsReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.reports.movementsReport(query));
  }

  /** Ordens de produção com insumos, rendimento e perda. */
  @Get('production.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse(CSV_RESPONSE)
  async production(
    @Query() query: ProductionReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.reports.productionReport(query));
  }

  /** Expedições, uma linha por item (lote/local). */
  @Get('shipments.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse(CSV_RESPONSE)
  async shipments(
    @Query() query: ShipmentsReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.reports.shipmentsReport(query));
  }
}

function send(res: Response, report: CsvReport): StreamableFile {
  res.setHeader('X-Report-Rows', String(report.rows));
  res.setHeader('X-Report-Truncated', String(report.truncated));
  return new StreamableFile(Buffer.from(report.content, 'utf8'), {
    type: CSV_TYPE,
    disposition: `attachment; filename="${report.fileName}"`,
  });
}

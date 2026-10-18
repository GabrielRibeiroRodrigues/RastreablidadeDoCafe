import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DashboardResponse } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';
import { PerformanceQueryDto, PerformanceResponse } from './performance.dto.js';
import { PerformanceService } from './performance.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly performance: PerformanceService,
  ) {}

  /** Indicadores da tela inicial (todos os perfis). */
  @Get()
  @ApiOkResponse({ type: DashboardResponse })
  summary(): Promise<DashboardResponse> {
    return this.dashboard.summary();
  }

  /** Desempenho do período (produção, expedição, rendimento e giro), comparado ao anterior. */
  @Get('performance')
  @ApiOkResponse({ type: PerformanceResponse })
  performanceSummary(@Query() query: PerformanceQueryDto): Promise<PerformanceResponse> {
    return this.performance.summary(query.days);
  }
}

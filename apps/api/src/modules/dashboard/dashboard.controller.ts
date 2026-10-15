import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DashboardResponse } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Indicadores da tela inicial (todos os perfis). */
  @Get()
  @ApiOkResponse({ type: DashboardResponse })
  summary(): Promise<DashboardResponse> {
    return this.dashboard.summary();
  }
}

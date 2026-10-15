import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ExpiringLotsResponse, ExpiringQueryDto } from './alerts.dto.js';
import { AlertsService } from './alerts.service.js';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** Lotes com saldo vencidos ou vencendo nos próximos N dias (todos os perfis). */
  @Get('expiring')
  @ApiOkResponse({ type: ExpiringLotsResponse })
  expiring(@Query() query: ExpiringQueryDto): Promise<ExpiringLotsResponse> {
    return this.alerts.expiring(query.days);
  }
}

import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';

/** Alertas de validade (consulta e job agendado `src/jobs/expiry-alert.job.ts`). */
@Module({
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}

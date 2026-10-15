import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { NonConformitiesModule } from '../non-conformities/non-conformities.module.js';
import { RecallsModule } from '../recalls/recalls.module.js';

/**
 * Semana 4: auditoria, não conformidade/quarentena, recall orquestrado e alertas de validade.
 * Agrupa os módulos para o AppModule importar um só.
 */
@Module({
  imports: [NotificationsModule, AuditModule, NonConformitiesModule, RecallsModule, AlertsModule],
})
export class QualityModule {}

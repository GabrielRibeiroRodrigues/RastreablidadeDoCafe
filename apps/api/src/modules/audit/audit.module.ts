import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StorageModule } from '../../storage/storage.module.js';
import { AuditRetentionService } from './audit-retention.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditLogsController, AuditLogsService } from './audit-logs.controller.js';
import { AuditService } from './audit.service.js';

/** Auditoria: serviço global (usado pelos módulos de negócio) + interceptor de fallback. */
@Global()
@Module({
  imports: [StorageModule],
  controllers: [AuditLogsController],
  providers: [
    AuditService,
    AuditLogsService,
    AuditRetentionService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService, AuditRetentionService],
})
export class AuditModule {}

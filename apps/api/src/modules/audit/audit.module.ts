import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditLogsController, AuditLogsService } from './audit-logs.controller.js';
import { AuditService } from './audit.service.js';

/** Auditoria: serviço global (usado pelos módulos de negócio) + interceptor de fallback. */
@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [
    AuditService,
    AuditLogsService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}

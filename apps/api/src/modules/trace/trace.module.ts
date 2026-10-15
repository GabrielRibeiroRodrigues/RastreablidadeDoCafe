import { Module } from '@nestjs/common';
import { TraceController } from './trace.controller.js';
import { TraceService } from './trace.service.js';

@Module({
  controllers: [TraceController],
  providers: [TraceService],
  // Recall (Semana 4) e página pública reutilizam as consultas.
  exports: [TraceService],
})
export class TraceModule {}

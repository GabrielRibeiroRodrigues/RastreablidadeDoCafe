import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TraceModule } from '../modules/trace/trace.module.js';
import { PublicTraceController } from './public-trace.controller.js';
import { PublicTraceService } from './public-trace.service.js';

/**
 * Rotas públicas (sem login). Fica em `src/public/`, fora de `src/modules/`, porque precisa do
 * `PrismaService` cru para achar o lote pelo token — ver `PublicTraceService`.
 */
@Module({
  imports: [
    TraceModule,
    // 30 requisições por minuto por IP. O guard é aplicado só no controller público; o armazenamento
    // é em memória (por instância), suficiente para conter abuso simples.
    ThrottlerModule.forRoot([{ name: 'public', ttl: 60_000, limit: 30 }]),
  ],
  controllers: [PublicTraceController],
  providers: [PublicTraceService],
})
export class PublicModule {}

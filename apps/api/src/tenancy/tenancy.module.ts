import { Global, Module } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ClsModule, type ClsService } from 'nestjs-cls';
import { REQUEST_ID_HEADER } from '../common/logging/request-id.js';
import { TenantContext, type TenantStore } from './tenant-context.js';
import { TenantPrismaService } from './tenant-prisma.service.js';

@Global()
@Module({
  imports: [
    // Um contexto por requisição HTTP; a empresa é gravada nele após a autenticação.
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        // requestId e IP entram no contexto já na abertura: a auditoria os lê daqui.
        setup: (cls: ClsService<TenantStore>, req: IncomingMessage, res: ServerResponse) => {
          const requestId = requestIdOf(req, res);
          const ip = clientIp(req);
          if (requestId) cls.set('requestId', requestId);
          if (ip) cls.set('ip', ip);
        },
      },
    }),
  ],
  providers: [TenantContext, TenantPrismaService],
  exports: [TenantContext, TenantPrismaService],
})
export class TenancyModule {}

/** O pino-http (montado antes) já resolveu o id e o devolveu no header de resposta. */
function requestIdOf(req: IncomingMessage, res: ServerResponse): string | undefined {
  const id = (req as IncomingMessage & { id?: unknown }).id;
  if (typeof id === 'string') return id;
  const header = res.getHeader(REQUEST_ID_HEADER);
  return typeof header === 'string' ? header : undefined;
}

/**
 * IP do cliente: primeiro item do `x-forwarded-for` (API Gateway/CloudFront) ou o socket.
 * Informativo — serve à auditoria, não a decisões de segurança.
 */
function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = first || req.socket?.remoteAddress;
  return ip ? ip.slice(0, 64) : undefined;
}

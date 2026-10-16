import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { concatMap, from, map, type Observable } from 'rxjs';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { AuditService } from './audit.service.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rede de segurança da auditoria: toda escrita bem-sucedida e autenticada que o serviço não
 * auditou explicitamente vira `http.<método>` com a rota e o id resultante. Leve de propósito:
 * não guarda corpo de requisição nem de resposta.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly tenant: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    if (!WRITE_METHODS.has(req.method)) return next.handle();

    return next
      .handle()
      .pipe(
        concatMap((result: unknown) =>
          from(this.recordFallback(context, req, result)).pipe(map(() => result)),
        ),
      );
  }

  private async recordFallback(
    context: ExecutionContext,
    req: Request,
    result: unknown,
  ): Promise<void> {
    // Rotas públicas (sem empresa no contexto) e operações já auditadas ficam de fora.
    if (!this.tenant.companyId || this.tenant.audited) return;
    const res = context.switchToHttp().getResponse<Response>();
    // Repetição idempotente: nada foi gravado de novo.
    if (res.getHeader('Idempotent-Replayed') === 'true') return;

    const route = routeOf(req);
    try {
      await this.audit.record({
        action: `http.${req.method.toLowerCase()}`,
        entityType: resourceOf(route),
        entityId: idOf(result) ?? paramId(req),
        after: { route, method: req.method },
      });
    } catch (error) {
      // A operação já aconteceu: falha na auditoria de fallback não deve virar erro para o cliente.
      this.logger.error({ err: error, route }, 'Failed to record fallback audit entry');
    }
  }
}

function routeOf(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? path : req.path;
}

/** `/v1/customers/:id` → `customers`. */
function resourceOf(route: string): string {
  const segments = route.split('/').filter((s) => s && !s.startsWith(':'));
  const [first, second] = segments;
  return (first === 'v1' ? second : first) ?? 'unknown';
}

function idOf(result: unknown): string | undefined {
  if (result && typeof result === 'object' && 'id' in result) {
    const { id } = result;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function paramId(req: Request): string | undefined {
  const id = (req.params as Record<string, string | undefined>)['id'];
  return typeof id === 'string' ? id : undefined;
}

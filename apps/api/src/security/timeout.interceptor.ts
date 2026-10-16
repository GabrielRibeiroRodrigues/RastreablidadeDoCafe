import {
  HttpStatus,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { throwError, timeout, type Observable } from 'rxjs';
import { DomainProblemException } from '../common/http/domain-problem.exception.js';
import type { Env } from '../config/env.js';

/**
 * Responde 503 (`/problems/request-timeout`) se o handler passar de `REQUEST_TIMEOUT_MS`.
 * Fica abaixo do limite de 30 s do API Gateway, para o cliente receber um problem+json em vez de
 * um 504 genérico. Não cancela a consulta em andamento: transações continuam atômicas.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly ms: number;

  constructor(config: ConfigService<Env, true>) {
    this.ms = config.get('REQUEST_TIMEOUT_MS', { infer: true });
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout({
        first: this.ms,
        with: () =>
          throwError(
            () =>
              new DomainProblemException(
                '/problems/request-timeout',
                'The request took too long to complete. Try again or narrow the filters.',
                HttpStatus.SERVICE_UNAVAILABLE,
              ),
          ),
      }),
    );
  }
}

import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators.js';
import { ClientErrorDto } from './client-errors.dto.js';

/**
 * Erros do navegador (ErrorBoundary, `window.onerror`, promessas rejeitadas) viram uma linha de
 * log estruturado — `event=client_error` — no mesmo CloudWatch da API, com o requestId e o
 * usuário quando houver. Público porque o erro pode acontecer no login ou na página do QR code;
 * por isso tem limite próprio e o corpo é truncado.
 */
@ApiTags('public')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('client-errors')
export class ClientErrorsController {
  private readonly logger = new Logger('ClientError');

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ public: { ttl: 60_000, limit: 20 } })
  @ApiNoContentResponse()
  @ApiTooManyRequestsResponse()
  report(@Body() dto: ClientErrorDto): void {
    this.logger.warn(
      {
        event: 'client_error',
        kind: dto.kind,
        message: dto.message,
        stack: dto.stack,
        url: dto.url,
        release: dto.release,
        userAgent: dto.userAgent,
      },
      `Client error: ${dto.message}`,
    );
  }
}

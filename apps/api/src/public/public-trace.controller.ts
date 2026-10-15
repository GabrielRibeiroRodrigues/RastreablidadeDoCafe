import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators.js';
import { PublicTraceResponse } from './public-trace.dto.js';
import { PublicTraceService } from './public-trace.service.js';

/** Rotas sem autenticação, com limite de requisições por IP (só neste controller). */
@ApiTags('public')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('public/trace')
export class PublicTraceController {
  constructor(private readonly publicTrace: PublicTraceService) {}

  /** Rastreio de um lote pelo token do QR code da etiqueta. Só dados publicáveis. */
  @Get(':token')
  @ApiOkResponse({ type: PublicTraceResponse })
  @ApiNotFoundResponse({ description: 'Código de rastreio não encontrado' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições por IP excedido' })
  get(@Param('token') token: string): Promise<PublicTraceResponse> {
    return this.publicTrace.byToken(token);
  }
}

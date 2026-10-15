import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ description: 'Segundos desde que o processo iniciou', example: 42.1 })
  uptime!: number;
}

class ReadinessResponse {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'up' })
  database!: 'up';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: o processo está de pé (não toca no banco). */
  @Get()
  @ApiOkResponse({ type: HealthResponse })
  check(): HealthResponse {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness: a API consegue falar com o banco. */
  @Get('ready')
  @ApiOkResponse({ type: ReadinessResponse })
  @ApiServiceUnavailableResponse({ description: 'Banco indisponível' })
  async ready(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unreachable');
    }
    return { status: 'ok', database: 'up' };
  }
}

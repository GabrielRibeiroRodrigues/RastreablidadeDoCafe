import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BackwardTraceResponse, ForwardTraceResponse } from './trace.dto.js';
import { TraceService } from './trace.service.js';

@ApiTags('trace')
@ApiBearerAuth()
@Controller('lots/:id/trace')
export class TraceController {
  constructor(private readonly trace: TraceService) {}

  /** De onde veio: lotes de origem, ordens de produção e fazendas. */
  @Get('backward')
  @ApiOkResponse({ type: BackwardTraceResponse })
  @ApiNotFoundResponse()
  backward(@Param('id', ParseUUIDPipe) id: string): Promise<BackwardTraceResponse> {
    return this.trace.backward(id);
  }

  /** Para onde foi: lotes derivados e expedições a clientes (base do recall). */
  @Get('forward')
  @ApiOkResponse({ type: ForwardTraceResponse })
  @ApiNotFoundResponse()
  forward(@Param('id', ParseUUIDPipe) id: string): Promise<ForwardTraceResponse> {
    return this.trace.forward(id);
  }
}

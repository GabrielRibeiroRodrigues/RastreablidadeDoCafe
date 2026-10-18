import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators.js';
import { LabelBatchDto, LabelBatchResponse, LabelResponse } from './labels.dto.js';
import { LabelsService } from './labels.service.js';

@ApiTags('labels')
@ApiBearerAuth()
@Controller('lots/:id/label')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /**
   * Gera (ou regenera) o PDF da etiqueta 100 × 150 mm com QR code para a página pública de
   * rastreio. O token público é criado na primeira etiqueta e nunca muda depois.
   */
  @Post()
  @HttpCode(200)
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: LabelResponse })
  @ApiNotFoundResponse({ description: 'Lote não encontrado na empresa' })
  @ApiServiceUnavailableResponse({ description: 'Armazenamento não configurado (S3_BUCKET)' })
  generate(@Param('id', ParseUUIDPipe) id: string): Promise<LabelResponse> {
    return this.labels.generate(id);
  }
}

@ApiTags('labels')
@ApiBearerAuth()
@Controller('labels')
export class LabelBatchController {
  constructor(private readonly labels: LabelsService) {}

  /** Um PDF com as etiquetas de vários lotes (uma por página), para imprimir de uma vez. */
  @Post('batch')
  @HttpCode(200)
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: LabelBatchResponse })
  @ApiNotFoundResponse({ description: 'Algum lote não foi encontrado na empresa' })
  @ApiServiceUnavailableResponse({ description: 'Armazenamento não configurado (S3_BUCKET)' })
  generateBatch(@Body() dto: LabelBatchDto): Promise<LabelBatchResponse> {
    return this.labels.generateBatch(dto.lotIds);
  }
}

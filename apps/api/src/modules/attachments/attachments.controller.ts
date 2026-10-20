import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators.js';
import {
  AttachmentResponse,
  CreateAttachmentDto,
  RemoveAttachmentDto,
  CreateAttachmentResponse,
  DownloadUrlResponse,
} from './attachments.dto.js';
import { AttachmentsService } from './attachments.service.js';

@ApiTags('attachments')
@ApiBearerAuth()
@ApiNotFoundResponse({ description: 'Lote ou anexo não encontrado na empresa' })
@ApiServiceUnavailableResponse({ description: 'Armazenamento não configurado (S3_BUCKET)' })
@Controller('lots/:lotId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** Registra o anexo (PENDING) e devolve o formulário pré-assinado para o upload direto. */
  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: CreateAttachmentResponse })
  requestUpload(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body() dto: CreateAttachmentDto,
  ): Promise<CreateAttachmentResponse> {
    return this.attachments.requestUpload(lotId, dto);
  }

  /** Confere o objeto no bucket (HEAD) e marca o anexo como UPLOADED. Idempotente. */
  @Post(':id/confirm')
  @HttpCode(200)
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: AttachmentResponse })
  @ApiConflictResponse({ description: 'Arquivo ausente no bucket ou diferente do declarado' })
  confirm(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttachmentResponse> {
    return this.attachments.confirm(lotId, id);
  }

  @Get()
  @ApiOkResponse({ type: AttachmentResponse, isArray: true })
  list(@Param('lotId', ParseUUIDPipe) lotId: string): Promise<AttachmentResponse[]> {
    return this.attachments.list(lotId);
  }

  /** Retira um anexo enviado por engano (o registro e o arquivo versionado ficam). */
  @Post(':id/remove')
  @HttpCode(204)
  @Roles('admin')
  @ApiNoContentResponse()
  remove(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveAttachmentDto,
  ): Promise<void> {
    return this.attachments.remove(lotId, id, dto.reason);
  }

  @Get(':id/download')
  @ApiOkResponse({ type: DownloadUrlResponse })
  download(
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DownloadUrlResponse> {
    return this.attachments.download(lotId, id);
  }
}

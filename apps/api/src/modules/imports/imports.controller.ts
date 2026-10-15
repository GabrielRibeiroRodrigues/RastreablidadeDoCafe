import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../auth/decorators.js';
import {
  IMPORT_ENTITIES,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  ImportQueryDto,
  ImportResult,
  type ImportEntity,
} from './imports.dto.js';
import { ImportsService } from './imports.service.js';

const CSV_TYPES = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];

interface UploadedCsv {
  buffer: Buffer;
  size: number;
}

/** Importação de cadastros por CSV (só admin). */
@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /**
   * Valida (e, com `dryRun=false` e nenhum erro, grava) um CSV de cadastros. Corpo `text/csv`
   * ou `multipart/form-data` com o campo `file`. Máximo de 2 MB e 5.000 linhas.
   */
  @Post(':entity')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }))
  @ApiParam({ name: 'entity', enum: IMPORT_ENTITIES })
  @ApiConsumes('text/csv', 'multipart/form-data')
  @ApiBody({
    description: `CSV com cabeçalho (UTF-8 ou Windows-1252, separador ";" ou ","). Máximo de ${IMPORT_MAX_ROWS} linhas.`,
    schema: { type: 'string', format: 'binary' },
  })
  @ApiOkResponse({ type: ImportResult })
  @ApiPayloadTooLargeResponse({ description: 'Arquivo acima de 2 MB ou de 5.000 linhas' })
  async import(
    @Param('entity', new ParseEnumPipe(IMPORT_ENTITIES)) entity: ImportEntity,
    @Query() query: ImportQueryDto,
    @Req() req: Request,
    @UploadedFile() file: UploadedCsv | undefined,
  ): Promise<ImportResult> {
    const content = file ? file.buffer : await readCsvBody(req);
    return this.imports.run(entity, decode(content), query.dryRun);
  }
}

/** Lê o corpo `text/csv` direto do stream (nenhum body parser global trata esse tipo). */
async function readCsvBody(req: Request): Promise<Buffer> {
  if (!req.is(CSV_TYPES)) {
    throw new UnsupportedMediaTypeException(
      'Send the CSV as text/csv or as multipart/form-data with a "file" field',
    );
  }
  const tooLarge = () => new PayloadTooLargeException('The CSV file exceeds 2 MB');
  if (Number(req.headers['content-length'] ?? 0) > IMPORT_MAX_BYTES) throw tooLarge();

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > IMPORT_MAX_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252 (o "CSV" padrão do Excel). */
function decode(content: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return new TextDecoder('windows-1252').decode(content);
  }
}

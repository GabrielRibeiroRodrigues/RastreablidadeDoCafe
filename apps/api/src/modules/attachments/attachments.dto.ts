import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { trim } from '../../common/http/transforms.js';
import { AttachmentStatus } from '../../generated/prisma/client.js';

/** Laudos, notas fiscais e fotos do lote. */
export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export class CreateAttachmentDto {
  @ApiProperty({ example: 'laudo-classificacao.pdf', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  // Só o nome do arquivo: sem separadores de caminho nem caracteres de controle.
  @Matches(/^[^/\\\p{Cc}]+$/u, { message: 'fileName must be a plain file name' })
  fileName!: string;

  @ApiProperty({ enum: ALLOWED_CONTENT_TYPES, example: 'application/pdf' })
  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: AllowedContentType;

  @ApiProperty({ description: 'Tamanho do arquivo em bytes', example: 184320, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  sizeBytes!: number;
}

export class AttachmentResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  lotId!: string;

  @ApiProperty({ example: 'laudo-classificacao.pdf' })
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  contentType!: string;

  @ApiProperty({ example: 184320 })
  sizeBytes!: number;

  @ApiProperty({ enum: AttachmentStatus, enumName: 'AttachmentStatus' })
  status!: AttachmentStatus;

  @ApiProperty({ format: 'uuid' })
  uploadedById!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true, type: Date })
  uploadedAt!: Date | null;
}

export class UploadInstructions {
  @ApiProperty({ description: 'URL do formulário (POST multipart/form-data)' })
  url!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Campos a enviar antes do campo `file`, na mesma ordem',
  })
  fields!: Record<string, string>;

  @ApiProperty()
  expiresAt!: Date;
}

export class CreateAttachmentResponse {
  @ApiProperty({ type: AttachmentResponse })
  attachment!: AttachmentResponse;

  @ApiProperty({ type: UploadInstructions })
  upload!: UploadInstructions;
}

export class DownloadUrlResponse {
  @ApiProperty({ description: 'URL pré-assinada (GET), de curta duração' })
  url!: string;

  @ApiProperty()
  expiresAt!: Date;
}

import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** Máximo de etiquetas por PDF em lote. */
export const LABEL_BATCH_MAX = 50;

export class LabelResponse {
  @ApiProperty({ description: 'URL pré-assinada (GET) do PDF da etiqueta, de curta duração' })
  url!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({
    description: 'Página pública de rastreio (conteúdo do QR code)',
    example: 'https://traceflow.example.com/rastreio/3q2-7wH1y0mXl4bJp9cS8g',
  })
  publicUrl!: string;
}

export class LabelBatchDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: LABEL_BATCH_MAX,
    description: `Lotes a imprimir, na ordem das páginas (até ${LABEL_BATCH_MAX})`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LABEL_BATCH_MAX)
  @IsUUID('all', { each: true })
  lotIds!: string[];
}

export class LabelBatchResponse {
  @ApiProperty({ description: 'URL pré-assinada (GET) do PDF com todas as etiquetas' })
  url!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ example: 12, description: 'Etiquetas no PDF (lotes repetidos contam uma vez)' })
  count!: number;
}

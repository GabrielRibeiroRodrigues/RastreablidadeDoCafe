import { ApiProperty } from '@nestjs/swagger';

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

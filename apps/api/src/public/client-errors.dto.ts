import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Corta em vez de recusar: um erro com stack enorme ainda deve ser registrado. */
const clip =
  (max: number) =>
  ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.slice(0, max) : value;

export const CLIENT_ERROR_KINDS = ['render', 'route', 'unhandled', 'rejection'] as const;

export class ClientErrorDto {
  @ApiProperty({ enum: CLIENT_ERROR_KINDS, description: 'Onde o erro foi capturado' })
  @IsIn(CLIENT_ERROR_KINDS)
  kind!: (typeof CLIENT_ERROR_KINDS)[number];

  @ApiProperty({ example: "Cannot read properties of undefined (reading 'code')" })
  @Transform(clip(500))
  @IsString()
  @MaxLength(500)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(clip(4000))
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @ApiPropertyOptional({ example: 'https://app.traceflow.dev/lotes/0190…' })
  @IsOptional()
  @Transform(clip(500))
  @IsString()
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({ description: 'Versão do front (hash do build)' })
  @IsOptional()
  @Transform(clip(64))
  @IsString()
  @MaxLength(64)
  release?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(clip(300))
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}

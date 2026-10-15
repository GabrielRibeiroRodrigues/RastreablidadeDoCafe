import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trim, trimToNull, upperTrim } from '../../common/http/transforms.js';
import { LotStatus, RoastLevel } from '../../generated/prisma/client.js';

/**
 * Campos de qualidade do café, comuns ao recebimento e à edição do lote.
 * Todos opcionais; `""` limpa o campo de texto.
 */
export class LotQualityDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-06-30',
    description: 'Validade (AAAA-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresAt must be a date (YYYY-MM-DD)' })
  expiresAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '2025/26', description: 'Safra' })
  @IsOptional()
  @Transform(trimToNull)
  @Matches(/^\d{4}(\/\d{2})?$/, { message: 'harvest must look like 2025 or 2025/26' })
  harvest?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Bourbon Amarelo' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  variety?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 3000, example: 1250 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3000)
  altitudeMeters?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 8, maximum: 20, example: 17 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(20)
  screenSize?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 100, example: 11.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  moisturePercent?: number | null;

  @ApiPropertyOptional({ enum: RoastLevel, enumName: 'RoastLevel', nullable: true })
  @IsOptional()
  @IsEnum(RoastLevel)
  roastLevel?: RoastLevel | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 100, example: 86.25 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  cuppingScore?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

/** Edição do lote: só dados descritivos. Código, produto e quantidade são imutáveis. */
export class UpdateLotDto extends LotQualityDto {}

/** Status que podem ser definidos manualmente (CONSUMED é automático). */
export const SETTABLE_STATUSES = [
  LotStatus.AVAILABLE,
  LotStatus.QUARANTINE,
  LotStatus.BLOCKED,
] as const;

export class ChangeLotStatusDto {
  @ApiProperty({ enum: SETTABLE_STATUSES, enumName: 'SettableLotStatus' })
  @IsIn(SETTABLE_STATUSES)
  status!: (typeof SETTABLE_STATUSES)[number];

  @ApiProperty({ example: 'Umidade acima de 12,5% na análise de recebimento' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

const LOT_SORTS = [
  '-receivedAt',
  'receivedAt',
  'code',
  '-code',
  'expiresAt',
  '-expiresAt',
] as const;
export type LotSort = (typeof LOT_SORTS)[number];

export class ListLotsQueryDto extends PagingDto {
  @ApiPropertyOptional({ description: 'Busca pelo código do lote', example: 'CAF-2026' })
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MaxLength(30)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: LotStatus, enumName: 'LotStatus' })
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: 3650,
    description: 'Só lotes que vencem nos próximos N dias (inclui vencidos)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  expiresWithinDays?: number;

  @ApiPropertyOptional({ enum: LOT_SORTS, default: '-receivedAt' })
  @IsOptional()
  @IsIn(LOT_SORTS)
  sort: LotSort = '-receivedAt';
}

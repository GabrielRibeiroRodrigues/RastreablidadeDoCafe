import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trim, trimToNull } from '../../common/http/transforms.js';
import { MovementType } from '../../generated/prisma/client.js';
import { IsQuantity } from './quantity.js';

/**
 * Tipos lançados manualmente. RECEIPT vem do recebimento, PRODUCTION da ordem de produção
 * (Semana 3) e REVERSAL do endpoint de estorno.
 */
export const MANUAL_MOVEMENT_TYPES = [
  MovementType.ISSUE,
  MovementType.TRANSFER,
  MovementType.ADJUSTMENT,
  MovementType.CONSUMPTION,
] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export class CreateMovementDto {
  @ApiProperty({ enum: MANUAL_MOVEMENT_TYPES, enumName: 'ManualMovementType' })
  @IsIn(MANUAL_MOVEMENT_TYPES)
  type!: ManualMovementType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lotId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Origem: ISSUE, TRANSFER, CONSUMPTION e ajuste de perda',
  })
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Destino: TRANSFER e ajuste de sobra' })
  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @ApiProperty({ example: '10.000' })
  @IsQuantity()
  quantity!: string;

  @ApiPropertyOptional({ description: 'Quando aconteceu (padrão: agora)' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Pedido 2026-0457' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  documentRef?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Obrigatório em ajustes',
    example: 'Quebra no inventário mensal',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class ReverseMovementDto {
  @ApiProperty({ example: 'Lançado no lote errado' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ListMovementsQueryDto extends PagingDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Origem ou destino' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ enum: MovementType, enumName: 'MovementType' })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ description: 'A partir de (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Até (exclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trimToNull, upperTrim } from '../../common/http/transforms.js';
import { ProductionStage, ProductType, Unit } from '../../generated/prisma/client.js';
import { LotSummary, ProductSummary, UserSummary } from '../inventory/inventory.dto.js';
import { CancellationResponse } from '../inventory/cancellation.js';
import { LotQualityDto } from '../inventory/lots.dto.js';
import { IsQuantity } from '../inventory/quantity.js';

export class ProductionInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lotId!: string;

  @ApiProperty({ format: 'uuid', description: 'Local de onde o insumo sai' })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ example: '10', description: 'Quantidade na unidade do lote de insumo' })
  @IsQuantity()
  quantity!: string;
}

export class CreateProductionOrderDto {
  @ApiProperty({ enum: ProductionStage, enumName: 'ProductionStage' })
  @IsEnum(ProductionStage)
  stage!: ProductionStage;

  @ApiProperty({ type: [ProductionInputDto], description: 'Lotes consumidos (1 a 20)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductionInputDto)
  inputs!: ProductionInputDto[];

  @ApiProperty({ format: 'uuid', description: 'Produto do lote gerado' })
  @IsUUID()
  outputProductId!: string;

  @ApiProperty({ format: 'uuid', description: 'Local onde o lote gerado entra' })
  @IsUUID()
  outputLocationId!: string;

  @ApiProperty({ example: '492.000', description: 'Quantidade produzida na unidade do produto' })
  @IsQuantity()
  outputQuantity!: string;

  @ApiPropertyOptional({ description: 'Quando foi produzido (padrão: agora)' })
  @IsOptional()
  @IsDateString()
  performedAt?: string;

  @ApiPropertyOptional({
    type: LotQualityDto,
    description:
      'Dados do lote gerado. Safra e variedade são herdadas dos insumos quando todos coincidem; ' +
      'o grau de torra padrão do produto é usado se não informado.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LotQualityDto)
  lot?: LotQualityDto;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Torrador 2, perfil 12 min' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export const PRODUCTION_SORTS = ['-performedAt', 'performedAt', '-number', 'number'] as const;
export type ProductionSort = (typeof PRODUCTION_SORTS)[number];

export class ListProductionOrdersQueryDto extends PagingDto {
  @ApiPropertyOptional({ enum: ProductionStage, enumName: 'ProductionStage' })
  @IsOptional()
  @IsEnum(ProductionStage)
  stage?: ProductionStage;

  @ApiPropertyOptional({ description: 'Número da ordem ou código do lote gerado' })
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MaxLength(30)
  q?: string;

  @ApiPropertyOptional({ description: 'A partir de (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Até (exclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Ordens que consumiram ou geraram o lote' })
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Quem registrou a ordem' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: PRODUCTION_SORTS, default: '-performedAt' })
  @IsOptional()
  @IsIn(PRODUCTION_SORTS)
  sort: ProductionSort = '-performedAt';
}

export class ProductionLot extends LotSummary {
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ example: '492.000' }) quantity!: string;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
}

export class ProductionOrderResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OP-2026-000001' }) number!: string;
  @ApiProperty({ enum: ProductionStage, enumName: 'ProductionStage' }) stage!: ProductionStage;
  @ApiProperty() performedAt!: Date;
  @ApiProperty({ type: ProductionLot, description: 'Lote gerado' }) output!: ProductionLot;
  @ApiProperty({ type: [ProductionLot], description: 'Lotes consumidos' }) inputs!: ProductionLot[];
  @ApiProperty({ example: '600.000', description: 'Massa de entrada em kg' }) inputMassKg!: string;
  @ApiProperty({ type: String, nullable: true, example: '492.000' }) outputMassKg!: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 82 }) yieldPercent!: number | null;
  @ApiProperty({ type: String, nullable: true, example: '108.000' }) lossKg!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: UserSummary }) user!: UserSummary;
  @ApiProperty({
    type: CancellationResponse,
    nullable: true,
    description: 'Cancelamento (produção e consumos estornados); null se a ordem vale',
  })
  cancellation!: CancellationResponse | null;
  @ApiProperty() createdAt!: Date;
}

/** Tipos de produto aceitos em cada etapa: o que entra e o que sai. */
export const STAGE_RULES: Record<
  ProductionStage,
  { inputs: readonly ProductType[]; output: readonly ProductType[] }
> = {
  PROCESSING: { inputs: [ProductType.GREEN], output: [ProductType.GREEN] },
  ROASTING: { inputs: [ProductType.GREEN], output: [ProductType.ROASTED] },
  BLENDING: { inputs: [ProductType.ROASTED, ProductType.BLEND], output: [ProductType.BLEND] },
  PACKAGING: {
    inputs: [ProductType.ROASTED, ProductType.BLEND, ProductType.PACKAGING],
    output: [ProductType.ROASTED, ProductType.BLEND],
  },
};

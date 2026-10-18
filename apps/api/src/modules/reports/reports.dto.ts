import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MovementType, ProductionStage } from '../../generated/prisma/client.js';
import { ListLotsQueryDto } from '../inventory/lots.dto.js';
import { StockQueryDto } from '../inventory/stock.controller.js';

/** Mesmos filtros e ordenação de `GET /stock`, sem paginação. */
export class StockReportQueryDto extends OmitType(StockQueryDto, ['page', 'pageSize'] as const) {}

/** Mesmos filtros e ordenação de `GET /lots`, sem paginação. */
export class LotsReportQueryDto extends OmitType(ListLotsQueryDto, ['page', 'pageSize'] as const) {}

class PeriodQueryDto {
  @ApiPropertyOptional({ description: 'A partir de (inclusive), ISO 8601', example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Até (exclusive), ISO 8601', example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class MovementsReportQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: MovementType, enumName: 'MovementType' })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lotId?: string;
}

export class ProductionReportQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: ProductionStage, enumName: 'ProductionStage' })
  @IsOptional()
  @IsEnum(ProductionStage)
  stage?: ProductionStage;
}

export class ShipmentsReportQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}

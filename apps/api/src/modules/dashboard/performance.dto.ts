import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { ProductType, Unit } from '../../generated/prisma/client.js';

export const PERFORMANCE_PERIODS = [30, 90, 180, 365] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

export class PerformanceQueryDto {
  @ApiPropertyOptional({ enum: PERFORMANCE_PERIODS, default: 30, description: 'Janela em dias' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(PERFORMANCE_PERIODS)
  days: PerformancePeriod = 30;
}

export class ProductionTotals {
  @ApiProperty({ example: 12 }) orders!: number;
  @ApiProperty({ example: '1800.000', description: 'Massa de entrada (kg)' }) inputKg!: string;
  @ApiProperty({ example: '1496.000', description: 'Massa de saída (kg)' }) outputKg!: string;
  @ApiProperty({ type: Number, nullable: true, example: 83.11 })
  yieldPercent!: number | null;
  @ApiProperty({ example: '304.000' }) lossKg!: string;
}

export class ShipmentTotals {
  @ApiProperty({ example: 9 }) count!: number;
  @ApiProperty({ example: 4 }) customers!: number;
}

export class PeriodTotals {
  @ApiProperty({ type: ProductionTotals }) production!: ProductionTotals;
  @ApiProperty({ type: ShipmentTotals }) shipments!: ShipmentTotals;
}

export class YieldBucket {
  @ApiProperty({ example: '2026-10-05', description: 'Início da semana ou do mês' })
  start!: string;
  @ApiProperty({ example: 3 }) orders!: number;
  @ApiProperty({ example: '420.000' }) outputKg!: string;
  @ApiProperty({ type: Number, nullable: true, example: 82.5 }) yieldPercent!: number | null;
}

export class ProductTurnover {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ example: 'VRD-BOURBON-AM' }) sku!: string;
  @ApiProperty({ example: 'Café verde Bourbon Amarelo' }) name!: string;
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' }) type!: ProductType;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({
    example: '120.000',
    description: 'Saídas no período (expedição + consumo), líquidas de estornos',
  })
  outflow!: string;
  @ApiProperty({ example: '40.000', description: 'Saldo atual' }) balance!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 10,
    description: 'Dias de cobertura no ritmo do período (saldo ÷ saída diária média)',
  })
  coverageDays!: number | null;
}

export class PerformanceResponse {
  @ApiProperty({ enum: PERFORMANCE_PERIODS }) days!: PerformancePeriod;
  @ApiProperty({ enum: ['week', 'month'], description: 'Agrupamento da série de rendimento' })
  bucket!: 'week' | 'month';
  @ApiProperty({ type: PeriodTotals, description: 'Últimos `days` dias' }) current!: PeriodTotals;
  @ApiProperty({ type: PeriodTotals, description: 'Os `days` dias anteriores, para comparação' })
  previous!: PeriodTotals;
  @ApiProperty({ type: [YieldBucket] }) yieldSeries!: YieldBucket[];
  @ApiProperty({ type: [ProductTurnover], description: 'Até 8 produtos com maior saída' })
  turnover!: ProductTurnover[];
}

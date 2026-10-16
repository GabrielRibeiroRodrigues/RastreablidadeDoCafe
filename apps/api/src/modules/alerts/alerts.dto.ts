import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { LotStatus, Unit } from '../../generated/prisma/client.js';
import { ProductSummary } from '../inventory/inventory.dto.js';

export class ExpiringQueryDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 365,
    description: 'Janela em dias (padrão: ALERT_EXPIRY_DAYS, 30)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class ExpiringLot {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000013' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus' }) status!: LotStatus;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ example: '12.500' }) balance!: string;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ type: String, format: 'date', example: '2026-11-01' }) expiresAt!: string;
  @ApiProperty({ example: 17, description: 'Dias até vencer (negativo = vencido há N dias)' })
  daysToExpiry!: number;
  @ApiProperty() expired!: boolean;
}

export class ExpiringLotsResponse {
  @ApiProperty({ example: 30 }) days!: number;
  @ApiProperty({ type: String, format: 'date', example: '2026-10-15' }) referenceDate!: string;
  @ApiProperty({ example: 3 }) expiredCount!: number;
  @ApiProperty({
    type: [ExpiringLot],
    description: 'Lotes com saldo que vencem na janela (inclui vencidos), por data',
  })
  data!: ExpiringLot[];
}

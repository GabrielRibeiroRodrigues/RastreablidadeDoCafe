import { ApiProperty } from '@nestjs/swagger';
import { ProductType, Unit } from '../../generated/prisma/client.js';
import { MovementResponse } from '../inventory/inventory.dto.js';

export class LotStatusCounts {
  @ApiProperty({ example: 12 }) available!: number;
  @ApiProperty({ example: 1 }) quarantine!: number;
  @ApiProperty({ example: 0 }) blocked!: number;
  @ApiProperty({ example: 30 }) consumed!: number;
}

export class DashboardProduct {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VRD-BOURBON-AM' }) sku!: string;
  @ApiProperty({ example: 'Café verde Bourbon Amarelo' }) name!: string;
}

export class ExpiringLot {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000123' }) code!: string;
  @ApiProperty({ type: DashboardProduct }) product!: DashboardProduct;
  @ApiProperty({ type: String, format: 'date', example: '2026-11-02' }) expiresAt!: string;
  @ApiProperty({ example: '42.500', description: 'Saldo atual do lote (todos os locais)' })
  balance!: string;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
}

export class ExpiringSoon {
  @ApiProperty({ example: 30, description: 'Janela em dias (inclui lotes já vencidos)' })
  days!: number;
  @ApiProperty({ example: 3, description: 'Lotes com saldo que vencem na janela' })
  count!: number;
  @ApiProperty({ type: [ExpiringLot], description: 'Até 5, os que vencem primeiro' })
  items!: ExpiringLot[];
}

export class ProductStock {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ example: 'VRD-BOURBON-AM' }) sku!: string;
  @ApiProperty({ example: 'Café verde Bourbon Amarelo' }) name!: string;
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' }) type!: ProductType;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '1250.000' }) quantity!: string;
}

export class Production30d {
  @ApiProperty({ example: 8 }) orders!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 83.4,
    description: 'Rendimento médio ponderado pela massa (Σ saída ÷ Σ entrada × 100)',
  })
  avgYieldPercent!: number | null;
  @ApiProperty({ example: '96.500', description: 'Perda total em kg' }) lossKg!: string;
}

export class Shipments30d {
  @ApiProperty({ example: 5 }) count!: number;
  @ApiProperty({ example: 3, description: 'Clientes distintos atendidos' }) customers!: number;
}

export class DashboardResponse {
  @ApiProperty({ type: LotStatusCounts, description: 'Lotes por situação' })
  lots!: LotStatusCounts;
  @ApiProperty({ type: ExpiringSoon }) expiringSoon!: ExpiringSoon;
  @ApiProperty({ example: 14, description: 'Movimentações com data de hoje (America/Sao_Paulo)' })
  movementsToday!: number;
  @ApiProperty({ type: [ProductStock], description: 'Até 8 produtos com maior saldo' })
  stockByProduct!: ProductStock[];
  @ApiProperty({ type: Production30d, description: 'Ordens de produção dos últimos 30 dias' })
  production30d!: Production30d;
  @ApiProperty({ type: Shipments30d, description: 'Expedições dos últimos 30 dias' })
  shipments30d!: Shipments30d;
  @ApiProperty({ type: [MovementResponse], description: 'Até 8 movimentações mais recentes' })
  recentMovements!: MovementResponse[];
}

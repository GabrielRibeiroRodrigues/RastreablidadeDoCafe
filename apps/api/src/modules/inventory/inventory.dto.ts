import { ApiProperty } from '@nestjs/swagger';
import {
  LocationType,
  LotStatus,
  MovementType,
  ProductType,
  RoastLevel,
  Unit,
} from '../../generated/prisma/client.js';

/** Respostas compartilhadas do módulo de estoque. Quantidades são strings com 3 casas. */

export class ProductSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VRD-BOURBON-AM' }) sku!: string;
  @ApiProperty({ example: 'Café verde Bourbon Amarelo' }) name!: string;
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' }) type!: ProductType;
}

export class SupplierSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'José Aparecido da Silva' }) name!: string;
  @ApiProperty({ nullable: true, type: String, example: 'Sítio Santa Inês' }) farmName!:
    string | null;
}

export class LocationSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'ARM-01' }) code!: string;
  @ApiProperty({ example: 'Armazém de café verde' }) name!: string;
  @ApiProperty({ enum: LocationType, enumName: 'LocationType' }) type!: LocationType;
}

export class LotSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000123' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus' }) status!: LotStatus;
}

export class UserSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Bruno Costa' }) name!: string;
}

export class LotResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000123' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus' }) status!: LotStatus;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ type: SupplierSummary, nullable: true }) supplier!: SupplierSummary | null;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '60.000', description: 'Quantidade recebida/produzida' })
  initialQuantity!: string;
  @ApiProperty({ example: '42.500', description: 'Saldo atual (soma de todos os locais)' })
  balance!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-06-30' })
  expiresAt!: string | null;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ type: String, nullable: true, example: '2025/26' }) harvest!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Bourbon Amarelo' }) variety!:
    string | null;
  @ApiProperty({ type: Number, nullable: true, example: 1250 }) altitudeMeters!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 17 }) screenSize!: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 11.5 }) moisturePercent!: number | null;
  @ApiProperty({ enum: RoastLevel, enumName: 'RoastLevel', nullable: true })
  roastLevel!: RoastLevel | null;
  @ApiProperty({ type: Number, nullable: true, example: 86.25 }) cuppingScore!: number | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class LocationBalance {
  @ApiProperty({ type: LocationSummary }) location!: LocationSummary;
  @ApiProperty({ example: '42.500' }) quantity!: string;
}

export class LotDetailResponse extends LotResponse {
  @ApiProperty({ type: [LocationBalance], description: 'Saldo por local (só locais com saldo)' })
  stock!: LocationBalance[];
}

export class MovementResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: MovementType, enumName: 'MovementType' }) type!: MovementType;
  @ApiProperty({ type: LotSummary }) lot!: LotSummary;
  @ApiProperty({ type: LocationSummary, nullable: true }) fromLocation!: LocationSummary | null;
  @ApiProperty({ type: LocationSummary, nullable: true }) toLocation!: LocationSummary | null;
  @ApiProperty({ example: '10.000' }) quantity!: string;
  @ApiProperty({ enum: Unit, enumName: 'Unit', description: 'Unidade do lote' }) unit!: Unit;
  @ApiProperty({ type: UserSummary }) user!: UserSummary;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty({ type: String, nullable: true, example: 'NF 12345' }) documentRef!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) reversalOfId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Estorno desta' })
  reversedById!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class StockRow {
  @ApiProperty({ type: LotSummary }) lot!: LotSummary;
  @ApiProperty({ type: String, format: 'date', nullable: true }) expiresAt!: string | null;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ type: LocationSummary }) location!: LocationSummary;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '42.500' }) quantity!: string;
}

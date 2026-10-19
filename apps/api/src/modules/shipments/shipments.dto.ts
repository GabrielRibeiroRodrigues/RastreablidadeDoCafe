import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trim, trimToNull } from '../../common/http/transforms.js';
import { Unit } from '../../generated/prisma/client.js';
import {
  LocationSummary,
  LotSummary,
  ProductSummary,
  UserSummary,
} from '../inventory/inventory.dto.js';
import { CancellationResponse } from '../inventory/cancellation.js';
import { IsQuantity } from '../inventory/quantity.js';

export const MAX_SHIPMENT_ITEMS = 50;

export class CreateShipmentItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lotId!: string;

  @ApiProperty({ format: 'uuid', description: 'Local de onde o lote sai' })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ example: '10.000', description: 'Quantidade na unidade do lote' })
  @IsQuantity()
  quantity!: string;
}

/** Expedição para um cliente: gera uma saída (ISSUE) no razão para cada item. */
export class CreateShipmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Pedido 2026-0457 / NF 7781' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  orderRef?: string | null;

  @ApiPropertyOptional({ description: 'Data/hora da expedição (padrão: agora)' })
  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiProperty({
    type: [CreateShipmentItemDto],
    minItems: 1,
    maxItems: MAX_SHIPMENT_ITEMS,
    description: 'Um item por par (lote, local); pares repetidos são rejeitados',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SHIPMENT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items!: CreateShipmentItemDto[];
}

export const SHIPMENT_SORTS = ['-shippedAt', 'shippedAt', '-number', 'number'] as const;
export type ShipmentSort = (typeof SHIPMENT_SORTS)[number];

export class ListShipmentsQueryDto extends PagingDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Expedições que contêm o lote' })
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @ApiPropertyOptional({ description: 'Expedidas a partir de (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Expedidas até (exclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Busca por número ou referência do pedido' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Quem registrou a expedição' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: SHIPMENT_SORTS, default: '-shippedAt' })
  @IsOptional()
  @IsIn(SHIPMENT_SORTS)
  sort: ShipmentSort = '-shippedAt';
}

export class CustomerSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Cafeteria Grão Fino' }) name!: string;
}

export class CustomerDetailSummary extends CustomerSummary {
  @ApiProperty({ type: String, nullable: true, example: '12345678000190' }) document!:
    string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Belo Horizonte' }) city!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'MG' }) state!: string | null;
}

export class ShipmentResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'EXP-2026-000001' }) number!: string;
  @ApiProperty({ type: CustomerSummary }) customer!: CustomerSummary;
  @ApiProperty({ type: String, nullable: true, example: 'Pedido 2026-0457' }) orderRef!:
    string | null;
  @ApiProperty() shippedAt!: Date;
  @ApiProperty({ example: 2 }) itemsCount!: number;
  @ApiProperty({
    example: 0,
    description: 'Itens cuja saída foi estornada; igual a itemsCount = expedição toda estornada',
  })
  reversedItemsCount!: number;
  @ApiProperty({ type: UserSummary }) user!: UserSummary;
  @ApiProperty({ type: CancellationResponse, nullable: true })
  cancellation!: CancellationResponse | null;
}

export class ShipmentItemReversal {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() occurredAt!: Date;
}

export class ShipmentItemResponse {
  @ApiProperty({ type: LotSummary }) lot!: LotSummary;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ type: LocationSummary }) location!: LocationSummary;
  @ApiProperty({ example: '10.000' }) quantity!: string;
  @ApiProperty({ enum: Unit, enumName: 'Unit', description: 'Unidade do lote' }) unit!: Unit;
  @ApiProperty({ format: 'uuid', description: 'Saída (ISSUE) no razão; estorne-a para corrigir' })
  movementId!: string;
  @ApiProperty({
    type: ShipmentItemReversal,
    nullable: true,
    description: 'Estorno da saída (o café não chegou ao cliente); null se vale',
  })
  reversal!: ShipmentItemReversal | null;
}

export class ShipmentDetailResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'EXP-2026-000001' }) number!: string;
  @ApiProperty({ type: CustomerDetailSummary }) customer!: CustomerDetailSummary;
  @ApiProperty({ type: String, nullable: true, example: 'Pedido 2026-0457' }) orderRef!:
    string | null;
  @ApiProperty() shippedAt!: Date;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: [ShipmentItemResponse] }) items!: ShipmentItemResponse[];
  @ApiProperty({ type: UserSummary }) user!: UserSummary;
  @ApiProperty({
    type: CancellationResponse,
    nullable: true,
    description: 'Cancelamento (todas as saídas estornadas); null se a expedição vale',
  })
  cancellation!: CancellationResponse | null;
  @ApiProperty() createdAt!: Date;
}

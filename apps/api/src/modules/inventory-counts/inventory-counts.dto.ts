import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trimToNull } from '../../common/http/transforms.js';
import { InventoryCountStatus, Unit } from '../../generated/prisma/client.js';
import {
  LocationSummary,
  LotSummary,
  ProductSummary,
  UserSummary,
} from '../inventory/inventory.dto.js';
import { IsQuantityOrZero } from '../inventory/quantity.js';

export class CreateInventoryCountDto {
  @ApiProperty({ format: 'uuid', description: 'Local a contar' })
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Contagem mensal do armazém' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CountItemDto {
  @ApiProperty({
    example: '11.5',
    description: 'Quantidade contada, na unidade do lote (0 = nada)',
  })
  @IsQuantityOrZero()
  countedQuantity!: string;
}

export class AddCountItemDto extends CountItemDto {
  @ApiProperty({ format: 'uuid', description: 'Lote encontrado no local que não estava na lista' })
  @IsUUID()
  lotId!: string;
}

export class ListInventoryCountsQueryDto extends PagingDto {
  @ApiPropertyOptional({ enum: InventoryCountStatus, enumName: 'InventoryCountStatus' })
  @IsOptional()
  @IsEnum(InventoryCountStatus)
  status?: InventoryCountStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class InventoryCountItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: LotSummary }) lot!: LotSummary;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '12.000', description: 'Saldo no local quando a contagem foi aberta' })
  systemQuantity!: string;
  @ApiProperty({
    example: '11.500',
    description: 'Saldo atual no local (aberta) ou no momento da aplicação (aplicada)',
  })
  currentQuantity!: string;
  @ApiProperty({ type: String, nullable: true, example: '11.500' }) countedQuantity!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '-0.500',
    description: 'Contado − saldo atual (prévia enquanto aberta; lançado depois de aplicada)',
  })
  difference!: string | null;
  @ApiProperty({ type: UserSummary, nullable: true }) countedBy!: UserSummary | null;
  @ApiProperty({ type: Date, nullable: true }) countedAt!: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String, description: 'Ajuste no razão' })
  adjustmentId!: string | null;
}

export class InventoryCountResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'INV-2026-000001' }) number!: string;
  @ApiProperty({ enum: InventoryCountStatus, enumName: 'InventoryCountStatus' })
  status!: InventoryCountStatus;
  @ApiProperty({ type: LocationSummary }) location!: LocationSummary;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ example: 8 }) itemsCount!: number;
  @ApiProperty({ example: 5, description: 'Itens já contados' }) countedCount!: number;
  @ApiProperty({ type: UserSummary }) createdBy!: UserSummary;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: UserSummary, nullable: true }) appliedBy!: UserSummary | null;
  @ApiProperty({ type: Date, nullable: true }) appliedAt!: Date | null;
  @ApiProperty({ type: UserSummary, nullable: true }) cancelledBy!: UserSummary | null;
  @ApiProperty({ type: Date, nullable: true }) cancelledAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancelReason!: string | null;
}

export class InventoryCountDetailResponse extends InventoryCountResponse {
  @ApiProperty({ type: [InventoryCountItemResponse] }) items!: InventoryCountItemResponse[];
}

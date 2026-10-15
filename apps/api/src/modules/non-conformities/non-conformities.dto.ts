import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trim } from '../../common/http/transforms.js';
import {
  LotStatus,
  NonConformityStatus,
  NonConformityType,
  Unit,
} from '../../generated/prisma/client.js';

export class OpenNonConformityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lotId!: string;

  @ApiProperty({ enum: NonConformityType, enumName: 'NonConformityType' })
  @IsEnum(NonConformityType)
  type!: NonConformityType;

  @ApiProperty({ example: 'Umidade de 13,8% na reanálise (limite 12,5%)' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;
}

/** Liberação ou descarte: sempre com justificativa. */
export class ResolveNonConformityDto {
  @ApiProperty({ example: 'Reanálise com umidade de 11,9%: lote dentro do padrão' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  justification!: string;
}

export class ListNonConformitiesQueryDto extends PagingDto {
  @ApiPropertyOptional({ enum: NonConformityStatus, enumName: 'NonConformityStatus' })
  @IsOptional()
  @IsEnum(NonConformityStatus)
  status?: NonConformityStatus;

  @ApiPropertyOptional({ enum: NonConformityType, enumName: 'NonConformityType' })
  @IsOptional()
  @IsEnum(NonConformityType)
  type?: NonConformityType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lotId?: string;
}

export class NcLotSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000009' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus' }) status!: LotStatus;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
}

export class NcUser {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ana Souza' }) name!: string;
}

export class NonConformityResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'NC-2026-000001' }) number!: string;
  @ApiProperty({ type: NcLotSummary }) lot!: NcLotSummary;
  @ApiProperty({ enum: NonConformityType, enumName: 'NonConformityType' })
  type!: NonConformityType;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: NonConformityStatus, enumName: 'NonConformityStatus' })
  status!: NonConformityStatus;
  @ApiProperty({ type: NcUser }) openedBy!: NcUser;
  @ApiProperty() openedAt!: Date;
  @ApiProperty({ type: String, nullable: true, description: 'Justificativa da liberação/descarte' })
  resolution!: string | null;
  @ApiProperty({ type: NcUser, nullable: true }) resolvedBy!: NcUser | null;
  @ApiProperty({ type: Date, nullable: true }) resolvedAt!: Date | null;
}

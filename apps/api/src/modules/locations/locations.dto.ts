import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { trim, trimToNull, upperTrim } from '../../common/http/transforms.js';
import { LocationType } from '../../generated/prisma/client.js';

export class CreateLocationDto {
  @ApiProperty({ description: 'Código curto, único na empresa', example: 'ARM-01' })
  @Transform(upperTrim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,19}$/, {
    message: 'code must have 1-20 characters: letters, digits and hyphens',
  })
  code!: string;

  @ApiProperty({ example: 'Armazém de café verde' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: LocationType, enumName: 'LocationType' })
  @IsEnum(LocationType)
  type!: LocationType;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}

const LOCATION_SORTS = ['code', '-code', 'name', '-name'] as const;
export type LocationSort = (typeof LOCATION_SORTS)[number];

export class ListLocationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Busca por código ou nome' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: LocationType, enumName: 'LocationType' })
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional({ enum: LOCATION_SORTS, default: 'code' })
  @IsOptional()
  @IsIn(LOCATION_SORTS)
  sort: LocationSort = 'code';
}

export class LocationResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ARM-01' })
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: LocationType, enumName: 'LocationType' })
  type!: LocationType;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

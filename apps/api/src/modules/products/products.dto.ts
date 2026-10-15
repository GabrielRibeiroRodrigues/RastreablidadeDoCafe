import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { trim, upperTrim } from '../../common/http/transforms.js';
import { ProductType, RoastLevel, Unit } from '../../generated/prisma/client.js';

export class CreateProductDto {
  @ApiProperty({ description: 'Código interno, único na empresa', example: 'VRD-BOURBON-AM' })
  @Transform(upperTrim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,39}$/, {
    message: 'sku must have 2-40 characters: letters, digits and hyphens',
  })
  sku!: string;

  @ApiProperty({ example: 'Café verde Bourbon Amarelo' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  @IsEnum(ProductType)
  type!: ProductType;

  @ApiProperty({ enum: Unit, enumName: 'Unit' })
  @IsEnum(Unit)
  unit!: Unit;

  @ApiPropertyOptional({
    enum: RoastLevel,
    enumName: 'RoastLevel',
    nullable: true,
    description: 'Só para torrados e blends',
  })
  @IsOptional()
  @IsEnum(RoastLevel)
  defaultRoastLevel?: RoastLevel | null;

  @ApiPropertyOptional({ example: 'Notas de caramelo', nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

const PRODUCT_SORTS = ['name', '-name', 'sku', '-sku', 'createdAt', '-createdAt'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ListProductsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome ou SKU', example: 'bourbon' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ProductType, enumName: 'ProductType' })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'name';
}

export class ProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'VRD-BOURBON-AM' })
  sku!: string;

  @ApiProperty({ example: 'Café verde Bourbon Amarelo' })
  name!: string;

  @ApiProperty({ enum: ProductType, enumName: 'ProductType' })
  type!: ProductType;

  @ApiProperty({ enum: Unit, enumName: 'Unit' })
  unit!: Unit;

  @ApiProperty({ enum: RoastLevel, enumName: 'RoastLevel', nullable: true })
  defaultRoastLevel!: RoastLevel | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

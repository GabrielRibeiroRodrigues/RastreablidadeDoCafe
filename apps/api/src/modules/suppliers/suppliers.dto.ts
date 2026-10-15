import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { digits, trim, trimToNull, upperTrim } from '../../common/http/transforms.js';
import { IsCpfOrCnpj, UFS } from '../../common/validation/br-documents.js';
import { SupplierType } from '../../generated/prisma/client.js';

/** Remove espaços, vazios e repetidos da lista de variedades. */
const trimList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? [
        ...new Set(
          (value as unknown[])
            .map((item) => (typeof item === 'string' ? item.trim() : item))
            .filter(Boolean),
        ),
      ]
    : value;

export class CreateSupplierDto {
  @ApiProperty({ example: 'José Aparecido da Silva' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: SupplierType, enumName: 'SupplierType' })
  @IsEnum(SupplierType)
  type!: SupplierType;

  @ApiPropertyOptional({
    description: 'CPF ou CNPJ (com ou sem pontuação; armazenado só com dígitos)',
    example: '111.222.333-96',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(digits)
  @IsCpfOrCnpj()
  document?: string | null;

  @ApiPropertyOptional({ example: 'Sítio Santa Inês', nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(120)
  farmName?: string | null;

  @ApiPropertyOptional({ example: 'Mantiqueira de Minas', nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  region?: string | null;

  @ApiPropertyOptional({ example: 'Carmo de Minas', nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ enum: UFS, example: 'MG', nullable: true })
  @IsOptional()
  @Transform(upperTrim)
  @IsIn(UFS)
  state?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 3000, example: 1250, nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3000)
  altitudeMeters?: number | null;

  @ApiPropertyOptional({ type: [String], example: ['Bourbon Amarelo', 'Catuaí Vermelho'] })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  varieties?: string[];

  @ApiPropertyOptional({ example: 'contato@fazenda.dev', nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ example: '35999990000', nullable: true, type: String })
  @IsOptional()
  @Transform(digits)
  @IsString()
  @MinLength(10)
  @MaxLength(13)
  phone?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

const SUPPLIER_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type SupplierSort = (typeof SUPPLIER_SORTS)[number];

export class ListSuppliersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome, fazenda ou documento' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: SupplierType, enumName: 'SupplierType' })
  @IsOptional()
  @IsEnum(SupplierType)
  type?: SupplierType;

  @ApiPropertyOptional({ enum: UFS })
  @IsOptional()
  @Transform(upperTrim)
  @IsIn(UFS)
  state?: string;

  @ApiPropertyOptional({ enum: SUPPLIER_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(SUPPLIER_SORTS)
  sort: SupplierSort = 'name';
}

export class SupplierResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SupplierType, enumName: 'SupplierType' })
  type!: SupplierType;

  @ApiProperty({ nullable: true, type: String })
  document!: string | null;

  @ApiProperty({ nullable: true, type: String })
  farmName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  region!: string | null;

  @ApiProperty({ nullable: true, type: String })
  city!: string | null;

  @ApiProperty({ nullable: true, type: String })
  state!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  altitudeMeters!: number | null;

  @ApiProperty({ type: [String] })
  varieties!: string[];

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

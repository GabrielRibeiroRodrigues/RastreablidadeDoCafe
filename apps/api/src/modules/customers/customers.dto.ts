import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../common/http/pagination.js';
import { digits, trim, trimToNull, upperTrim } from '../../common/http/transforms.js';
import { IsCpfOrCnpj, UFS } from '../../common/validation/br-documents.js';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Cafeteria Grão Fino' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'CPF ou CNPJ (com ou sem pontuação; armazenado só com dígitos)',
    example: '44.555.666/0001-81',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(digits)
  @IsCpfOrCnpj()
  document?: string | null;

  @ApiPropertyOptional({ example: 'compras@graofino.dev', nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ example: '11988887777', nullable: true, type: String })
  @IsOptional()
  @Transform(digits)
  @IsString()
  @MinLength(10)
  @MaxLength(13)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'São Paulo', nullable: true, type: String })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ enum: UFS, example: 'SP', nullable: true })
  @IsOptional()
  @Transform(upperTrim)
  @IsIn(UFS)
  state?: string | null;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

const CUSTOMER_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export class ListCustomersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome, documento ou e-mail' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: UFS })
  @IsOptional()
  @Transform(upperTrim)
  @IsIn(UFS)
  state?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sort: CustomerSort = 'name';
}

export class CustomerResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  document!: string | null;

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String })
  city!: string | null;

  @ApiProperty({ nullable: true, type: String })
  state!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

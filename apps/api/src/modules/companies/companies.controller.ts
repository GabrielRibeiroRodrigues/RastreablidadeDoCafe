import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { trim, trimToNull } from '../../common/http/transforms.js';
import { Roles } from '../../auth/decorators.js';
import { CompaniesService } from './companies.service.js';

export class CompanyResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Torrefação Serra Azul' })
  name!: string;

  @ApiProperty({ description: 'CNPJ (somente dígitos)', example: '12345678000190' })
  taxId!: string;

  @ApiProperty({ description: 'Prefixo dos códigos de lote', example: 'CAF' })
  lotPrefix!: string;

  @ApiProperty({ type: String, nullable: true, example: '#5b3a29', description: 'Cor da marca' })
  brandColor!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Cafés especiais da Mantiqueira' })
  tagline!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'https://serraazul.com.br' })
  website!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Torrefação Serra Azul' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '#5b3a29' })
  @IsOptional()
  @Transform(trimToNull)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'brandColor must be a #RRGGBB color' })
  brandColor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Cafés especiais da Mantiqueira' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(140)
  tagline?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://serraazul.com.br' })
  @IsOptional()
  @Transform(trimToNull)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(200)
  website?: string | null;
}

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  /** Empresa do usuário autenticado. Não existe rota para ver outra empresa. */
  @Get('me')
  @ApiOkResponse({ type: CompanyResponse })
  me(): Promise<CompanyResponse> {
    return this.companies.current();
  }

  @Patch('me')
  @Roles('admin')
  @ApiOkResponse({ type: CompanyResponse })
  update(@Body() dto: UpdateCompanyDto): Promise<CompanyResponse> {
    return this.companies.updateCurrent(dto);
  }
}

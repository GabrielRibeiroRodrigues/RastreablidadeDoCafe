import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
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

  @ApiProperty()
  createdAt!: Date;
}

export class UpdateCompanyDto {
  @ApiProperty({ example: 'Torrefação Serra Azul' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
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

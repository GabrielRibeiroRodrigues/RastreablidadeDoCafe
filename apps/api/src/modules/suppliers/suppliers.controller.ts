import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  SupplierResponse,
  UpdateSupplierDto,
} from './suppliers.dto.js';
import { SuppliersService } from './suppliers.service.js';

/** Fornecedores de café: produtores, fazendas, cooperativas e comerciantes. */
@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @ApiPageResponse(SupplierResponse)
  list(@Query() query: ListSuppliersQueryDto): Promise<Page<SupplierResponse>> {
    return this.suppliers.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: SupplierResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponse> {
    return this.suppliers.get(id);
  }

  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: SupplierResponse })
  @ApiConflictResponse({ description: 'Documento já cadastrado na empresa' })
  create(@Body() dto: CreateSupplierDto): Promise<SupplierResponse> {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: SupplierResponse })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierResponse> {
    return this.suppliers.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: SupplierResponse })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponse> {
    return this.suppliers.setActive(id, false);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: SupplierResponse })
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponse> {
    return this.suppliers.setActive(id, true);
  }
}

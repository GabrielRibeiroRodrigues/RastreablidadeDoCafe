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
  CreateCustomerDto,
  CustomerResponse,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './customers.dto.js';
import { CustomersService } from './customers.service.js';

/** Clientes que recebem expedições (base do recall "para frente"). */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiPageResponse(CustomerResponse)
  list(@Query() query: ListCustomersQueryDto): Promise<Page<CustomerResponse>> {
    return this.customers.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: CustomerResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponse> {
    return this.customers.get(id);
  }

  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: CustomerResponse })
  @ApiConflictResponse({ description: 'Documento já cadastrado na empresa' })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerResponse> {
    return this.customers.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: CustomerResponse })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    return this.customers.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: CustomerResponse })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponse> {
    return this.customers.setActive(id, false);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: CustomerResponse })
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponse> {
    return this.customers.setActive(id, true);
  }
}

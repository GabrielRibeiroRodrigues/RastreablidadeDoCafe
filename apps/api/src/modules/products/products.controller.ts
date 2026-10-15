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
  CreateProductDto,
  ListProductsQueryDto,
  ProductResponse,
  UpdateProductDto,
} from './products.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiPageResponse(ProductResponse)
  list(@Query() query: ListProductsQueryDto): Promise<Page<ProductResponse>> {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.get(id);
  }

  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiConflictResponse({ description: 'SKU já usado na empresa' })
  create(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.products.update(id, dto);
  }

  /** Desativar em vez de apagar: lotes vão referenciar o produto. */
  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: ProductResponse })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.setActive(id, false);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: ProductResponse })
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.products.setActive(id, true);
  }
}

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
  CreateLocationDto,
  ListLocationsQueryDto,
  LocationResponse,
  UpdateLocationDto,
} from './locations.dto.js';
import { LocationsService } from './locations.service.js';

/** Locais físicos de estoque: armazém, silo, torrefação, quarentena, expedição. */
@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiPageResponse(LocationResponse)
  list(@Query() query: ListLocationsQueryDto): Promise<Page<LocationResponse>> {
    return this.locations.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: LocationResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LocationResponse> {
    return this.locations.get(id);
  }

  @Post()
  @Roles('admin', 'operator')
  @ApiCreatedResponse({ type: LocationResponse })
  @ApiConflictResponse({ description: 'Código já usado na empresa' })
  create(@Body() dto: CreateLocationDto): Promise<LocationResponse> {
    return this.locations.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'operator')
  @ApiOkResponse({ type: LocationResponse })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationResponse> {
    return this.locations.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: LocationResponse })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<LocationResponse> {
    return this.locations.setActive(id, false);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: LocationResponse })
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<LocationResponse> {
    return this.locations.setActive(id, true);
  }
}

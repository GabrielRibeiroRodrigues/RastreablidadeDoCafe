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
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { InviteUserDto, ListUsersQueryDto, UpdateUserDto, UserResponse } from './users.dto.js';
import { UsersService } from './users.service.js';

/** Usuários da empresa: convite, perfil e acesso. Só admin. */
@ApiTags('users')
@ApiBearerAuth()
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiPageResponse(UserResponse)
  list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Page<UserResponse>> {
    return this.users.list(query, user);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.users.get(id, user);
  }

  /** Cria o acesso; em produção o Cognito envia o convite com senha temporária por e-mail. */
  @Post()
  @ApiCreatedResponse({ type: UserResponse })
  @ApiConflictResponse({ description: 'E-mail já cadastrado' })
  invite(@Body() dto: InviteUserDto, @CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.users.invite(dto, user);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserResponse })
  @ApiConflictResponse({ description: 'Mudaria o próprio perfil ou deixaria a empresa sem admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponse> {
    return this.users.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOkResponse({ type: UserResponse })
  @ApiConflictResponse({ description: 'Própria conta ou último admin' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.users.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOkResponse({ type: UserResponse })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.users.setActive(id, true, user);
  }
}

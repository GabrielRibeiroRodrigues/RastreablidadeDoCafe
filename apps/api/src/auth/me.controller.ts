import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ROLES, type Role as AppRole } from '@traceflow/shared';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './decorators.js';

class MeCompany {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Torrefação Serra Azul' })
  name!: string;
}

export class MeResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana@serraazul.dev' })
  email!: string;

  @ApiProperty({ example: 'Ana Ribeiro' })
  name!: string;

  @ApiProperty({ enum: ROLES, isArray: true, example: ['admin'] })
  roles!: AppRole[];

  @ApiProperty({ type: MeCompany })
  company!: MeCompany;
}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  /** Quem sou eu: usuário autenticado, perfis do token e empresa. */
  @Get()
  @ApiOkResponse({ type: MeResponse })
  me(@CurrentUser() user: AuthUser): MeResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      company: { id: user.companyId, name: user.companyName },
    };
  }
}

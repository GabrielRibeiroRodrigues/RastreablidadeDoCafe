import { Body, Controller, Get, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ROLES, type Role as AppRole } from '@traceflow/shared';
import { IsEmail } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAppRole } from '../auth-user.js';
import { Public } from '../decorators.js';
import { MockKeyStore } from '../mock-key-store.js';

const TOKEN_TTL_SECONDS = 60 * 60;

class DevUser {
  @ApiProperty({ example: 'ana@serraazul.dev' })
  email!: string;

  @ApiProperty({ example: 'Ana Ribeiro' })
  name!: string;

  @ApiProperty({ enum: ROLES, isArray: true })
  roles!: AppRole[];

  @ApiProperty({ example: 'Torrefação Serra Azul' })
  companyName!: string;
}

class DevTokenRequest {
  @ApiProperty({ example: 'ana@serraazul.dev' })
  @IsEmail()
  email!: string;
}

class DevTokenResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: TOKEN_TTL_SECONDS })
  expiresIn!: number;
}

@ApiTags('dev (somente AUTH_MODE=mock)')
@Public()
@Controller('dev')
export class DevAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: MockKeyStore,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'Lista os usuários ativos para a tela de login de desenvolvimento' })
  @ApiOkResponse({ type: DevUser, isArray: true })
  async users(): Promise<DevUser[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      include: { company: { select: { name: true } } },
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    });
    return users.map((user) => ({
      email: user.email,
      name: user.name,
      roles: [toAppRole(user.role)],
      companyName: user.company.name,
    }));
  }

  @Post('token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Emite um access token no formato do Cognito para o usuário' })
  @ApiOkResponse({ type: DevTokenResponse })
  async token(@Body() { email }: DevTokenRequest): Promise<DevTokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) {
      throw new NotFoundException('No active user with this e-mail');
    }

    const accessToken = await this.keys.sign(
      { sub: user.cognitoSub, username: user.email, 'cognito:groups': [toAppRole(user.role)] },
      TOKEN_TTL_SECONDS,
    );
    return { accessToken, expiresIn: TOKEN_TTL_SECONDS };
  }

  @Get('.well-known/jwks.json')
  @ApiOperation({ summary: 'Chave pública do emissor simulado (formato JWKS, como o Cognito)' })
  jwks() {
    return this.keys.jwks();
  }
}

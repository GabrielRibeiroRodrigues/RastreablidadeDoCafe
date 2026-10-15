import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy, type SecretOrKeyProvider } from 'passport-jwt';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from '../tenancy/tenant-context.js';
import { parseAccessTokenClaims } from './access-token-claims.js';
import type { AuthUser } from './auth-user.js';
import { MOCK_ISSUER, MockKeyStore } from './mock-key-store.js';

/**
 * Uma única estratégia para Cognito e para o emissor simulado: muda só de onde vem a chave pública
 * (JWKS do User Pool vs. chave em memória). Assinatura, emissor, expiração e claims são validados
 * pelo mesmo código nos dois modos.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly clientId: string;

  constructor(
    config: ConfigService<Env, true>,
    mockKeys: MockKeyStore,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {
    const mode = config.get('AUTH_MODE', { infer: true });
    const { issuer, keyProvider } =
      mode === 'mock'
        ? { issuer: MOCK_ISSUER, keyProvider: mockKeyProvider(mockKeys) }
        : cognitoKeyProvider(config);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: keyProvider,
      issuer,
      algorithms: ['RS256'],
      ignoreExpiration: false,
    });

    this.clientId = config.get('COGNITO_CLIENT_ID', { infer: true });
    if (mode === 'mock') {
      this.logger.warn('AUTH_MODE=mock: accepting tokens from the local mock issuer');
    }
  }

  async validate(payload: unknown): Promise<AuthUser> {
    const { sub, roles } = parseAccessTokenClaims(payload, this.clientId);

    const user = await this.prisma.user.findUnique({
      where: { cognitoSub: sub },
      include: { company: { select: { name: true } } },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('User is not registered or is inactive');
    }

    // A partir daqui, toda consulta de negócio desta requisição fica presa a esta empresa.
    this.tenant.set(user.companyId, user.id);

    return {
      id: user.id,
      companyId: user.companyId,
      companyName: user.company.name,
      email: user.email,
      name: user.name,
      roles,
    };
  }
}

function cognitoKeyProvider(config: ConfigService<Env, true>): {
  issuer: string;
  keyProvider: SecretOrKeyProvider;
} {
  const region = config.get('COGNITO_REGION', { infer: true });
  const poolId = config.get('COGNITO_USER_POOL_ID', { infer: true });
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
  return {
    issuer,
    keyProvider: passportJwtSecret({
      jwksUri: `${issuer}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    }),
  };
}

function mockKeyProvider(keys: MockKeyStore): SecretOrKeyProvider {
  return (_request, _rawToken, done) => {
    keys.publicKeyPem().then(
      (pem) => done(null, pem),
      (error: unknown) => done(error),
    );
  };
}

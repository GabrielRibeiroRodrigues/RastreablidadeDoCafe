import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  exportJWK,
  exportSPKI,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from 'jose';
import type { Env } from '../config/env.js';

export const MOCK_ISSUER = 'urn:traceflow:mock-issuer';
const MOCK_KID = 'traceflow-mock-key';
const ALGORITHM = 'RS256';

interface KeyMaterial {
  privateKey: CryptoKey;
  publicKeyPem: string;
  publicJwk: JWK;
}

/**
 * Par de chaves RSA efêmero do emissor simulado (só em AUTH_MODE=mock).
 * Gerado na primeira utilização e mantido em memória: reiniciar a API invalida os tokens.
 */
@Injectable()
export class MockKeyStore {
  private keys?: Promise<KeyMaterial>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async publicKeyPem(): Promise<string> {
    return (await this.material()).publicKeyPem;
  }

  async jwks(): Promise<{ keys: JWK[] }> {
    return { keys: [(await this.material()).publicJwk] };
  }

  /** Assina um token com o mesmo formato de um access token do Cognito. */
  async sign(claims: JWTPayload & { sub: string }, expiresInSeconds: number): Promise<string> {
    const { privateKey } = await this.material();
    return new SignJWT({
      token_use: 'access',
      client_id: this.config.get('COGNITO_CLIENT_ID', { infer: true }),
      ...claims,
    })
      .setProtectedHeader({ alg: ALGORITHM, kid: MOCK_KID })
      .setIssuer(MOCK_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(privateKey);
  }

  private material(): Promise<KeyMaterial> {
    if (this.config.get('AUTH_MODE', { infer: true }) !== 'mock') {
      throw new Error('MockKeyStore is only available when AUTH_MODE=mock');
    }
    this.keys ??= (async () => {
      const { privateKey, publicKey } = await generateKeyPair(ALGORITHM, { extractable: true });
      const publicJwk = {
        ...(await exportJWK(publicKey)),
        kid: MOCK_KID,
        alg: ALGORITHM,
        use: 'sig',
      };
      return { privateKey, publicKeyPem: await exportSPKI(publicKey), publicJwk };
    })();
    return this.keys;
  }
}

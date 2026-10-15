import { UnauthorizedException } from '@nestjs/common';
import type { Role as AppRole } from '@traceflow/shared';
import { rolesFromGroups } from './auth-user.js';

export interface AccessTokenClaims {
  sub: string;
  roles: AppRole[];
}

/**
 * Valida as claims específicas de um access token do Cognito, depois que assinatura, emissor e
 * expiração já foram verificados pelo passport-jwt. Access tokens do Cognito não têm `aud`:
 * o app client vem em `client_id`.
 */
export function parseAccessTokenClaims(
  payload: unknown,
  expectedClientId: string,
): AccessTokenClaims {
  if (typeof payload !== 'object' || payload === null) {
    throw new UnauthorizedException('Malformed token');
  }
  const claims = payload as Record<string, unknown>;

  if (claims['token_use'] !== 'access') {
    throw new UnauthorizedException('An access token is required');
  }
  if (claims['client_id'] !== expectedClientId) {
    throw new UnauthorizedException('Token was issued for another client');
  }
  const sub = claims['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new UnauthorizedException('Token has no subject');
  }

  return { sub, roles: rolesFromGroups(claims['cognito:groups']) };
}

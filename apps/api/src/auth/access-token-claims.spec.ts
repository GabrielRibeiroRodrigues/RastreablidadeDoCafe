import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseAccessTokenClaims } from './access-token-claims.js';

const CLIENT_ID = 'web-client';
const valid = {
  sub: 'abc-123',
  token_use: 'access',
  client_id: CLIENT_ID,
  'cognito:groups': ['operator'],
};

describe('parseAccessTokenClaims', () => {
  it('extracts the subject and the roles from cognito:groups', () => {
    expect(parseAccessTokenClaims(valid, CLIENT_ID)).toEqual({
      sub: 'abc-123',
      roles: ['operator'],
    });
  });

  it('ignores Cognito groups that are not application roles', () => {
    const claims = { ...valid, 'cognito:groups': ['admin', 'us-east-1_pool_Google', 42] };
    expect(parseAccessTokenClaims(claims, CLIENT_ID).roles).toEqual(['admin']);
  });

  it('accepts a user without groups (authenticated, but no role)', () => {
    const { 'cognito:groups': _groups, ...withoutGroups } = valid;
    expect(parseAccessTokenClaims(withoutGroups, CLIENT_ID).roles).toEqual([]);
  });

  it.each([
    ['an ID token', { ...valid, token_use: 'id' }],
    ['a token for another app client', { ...valid, client_id: 'other-client' }],
    ['a token without subject', { ...valid, sub: '' }],
    ['a non-object payload', 'not-a-payload'],
  ])('rejects %s', (_case, payload) => {
    expect(() => parseAccessTokenClaims(payload, CLIENT_ID)).toThrow(UnauthorizedException);
  });
});

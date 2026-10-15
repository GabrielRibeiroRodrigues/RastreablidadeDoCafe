import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, extractRoles, isTokenExpired } from './jwt';
import { fakeJwt } from '@/test/fake-jwt';

describe('jwt helpers', () => {
  it('extracts known roles from cognito:groups and ignores unknown groups', () => {
    const token = fakeJwt({
      sub: 'u1',
      'cognito:groups': ['operator', 'us-east-1_xyz_Google', 'auditor'],
    });

    expect(extractRoles(token)).toEqual(['operator', 'auditor']);
  });

  it('returns no roles when the claim is missing or the token is malformed', () => {
    expect(extractRoles(fakeJwt({ sub: 'u1' }))).toEqual([]);
    expect(extractRoles('not-a-jwt')).toEqual([]);
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });

  it('decodes UTF-8 claims', () => {
    expect(decodeJwtPayload(fakeJwt({ name: 'João Café' }))).toMatchObject({ name: 'João Café' });
  });

  it('detects expired tokens', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(isTokenExpired(fakeJwt({ exp: now / 1000 - 60 }), now)).toBe(true);
    expect(isTokenExpired(fakeJwt({ exp: now / 1000 + 3600 }), now)).toBe(false);
  });
});

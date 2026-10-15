import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
const COGNITO = { COGNITO_REGION: 'us-east-1', COGNITO_USER_POOL_ID: 'us-east-1_abc123' };

describe('validateEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    const env = validateEnv({ DATABASE_URL, ...COGNITO });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: ['http://localhost:5173'],
      SWAGGER_ENABLED: true,
      DATABASE_POOL_MAX: 10,
      AUTH_MODE: 'cognito',
      COGNITO_CLIENT_ID: 'traceflow-local',
    });
  });

  it('coerces strings coming from process.env', () => {
    const env = validateEnv({
      DATABASE_URL,
      ...COGNITO,
      PORT: '8080',
      SWAGGER_ENABLED: 'false',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
    });

    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('fails fast with a readable message on invalid values', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging', PORT: 'abc' })).toThrow(
      /Invalid environment variables[\s\S]*NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL/,
    );
  });

  describe('authentication mode', () => {
    it('requires the Cognito pool settings in cognito mode', () => {
      expect(() => validateEnv({ DATABASE_URL, AUTH_MODE: 'cognito' })).toThrow(
        /COGNITO_REGION[\s\S]*COGNITO_USER_POOL_ID/,
      );
    });

    it('accepts mock mode outside production without Cognito settings', () => {
      expect(validateEnv({ DATABASE_URL, AUTH_MODE: 'mock' }).AUTH_MODE).toBe('mock');
    });

    it('refuses to boot with mock authentication in production', () => {
      expect(() =>
        validateEnv({ DATABASE_URL, ...COGNITO, NODE_ENV: 'production', AUTH_MODE: 'mock' }),
      ).toThrow(/mock authentication is forbidden when NODE_ENV=production/);
    });
  });
});

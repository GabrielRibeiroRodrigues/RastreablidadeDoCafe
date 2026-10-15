import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

describe('validateEnv', () => {
  it('applies defaults for an empty environment', () => {
    const env = validateEnv({ DATABASE_URL });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: ['http://localhost:5173'],
      SWAGGER_ENABLED: true,
      DATABASE_POOL_MAX: 10,
    });
  });

  it('coerces strings coming from process.env', () => {
    const env = validateEnv({
      DATABASE_URL,
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
});

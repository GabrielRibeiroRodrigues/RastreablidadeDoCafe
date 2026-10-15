import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('applies defaults for an empty environment', () => {
    const env = validateEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: ['http://localhost:5173'],
      SWAGGER_ENABLED: true,
    });
  });

  it('coerces strings coming from process.env', () => {
    const env = validateEnv({
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
      /Invalid environment variables[\s\S]*NODE_ENV[\s\S]*PORT/,
    );
  });
});

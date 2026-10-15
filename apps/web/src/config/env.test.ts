import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to mock mode against the local API', () => {
    expect(parseEnv({})).toEqual({ apiUrl: 'http://localhost:3000', authMode: 'mock' });
  });

  it('requires the Cognito settings when VITE_AUTH_MODE=cognito', () => {
    expect(() => parseEnv({ VITE_AUTH_MODE: 'cognito' })).toThrow(/VITE_COGNITO_CLIENT_ID/);
  });

  it('builds the Cognito config and trims trailing slashes', () => {
    const env = parseEnv({
      VITE_API_URL: 'https://api.example.com/',
      VITE_AUTH_MODE: 'cognito',
      VITE_COGNITO_AUTHORITY: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc',
      VITE_COGNITO_CLIENT_ID: 'client-123',
      VITE_COGNITO_REDIRECT_URI: 'http://localhost:5173/auth/callback',
      VITE_COGNITO_LOGOUT_URI: 'http://localhost:5173/login',
      VITE_COGNITO_DOMAIN: 'https://traceflow.auth.us-east-1.amazoncognito.com/',
    });

    expect(env).toMatchObject({
      apiUrl: 'https://api.example.com',
      authMode: 'cognito',
      cognito: {
        clientId: 'client-123',
        domain: 'https://traceflow.auth.us-east-1.amazoncognito.com',
      },
    });
  });
});

import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from '../src/lambda.js';

/** Evento mínimo do API Gateway HTTP API (payload v2), como o da Lambda em produção. */
function event(method: string, path: string, headers: Record<string, string> = {}) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'api.test', 'x-forwarded-for': '203.0.113.7', ...headers },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'api.test',
      domainPrefix: 'api',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '203.0.113.7', userAgent: 'vitest' },
      requestId: 'lambda-test',
      routeKey: '$default',
      stage: '$default',
      time: new Date().toUTCString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

const context = { callbackWaitsForEmptyEventLoop: true } as Context;

/** O handler da Lambda sobe o Nest uma vez e atende eventos do API Gateway. */
describe('Lambda handler (e2e)', () => {
  it('answers the readiness check through the API Gateway event', async () => {
    const res = await handler(event('GET', '/v1/health/ready'), context);
    expect(res).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(res.body!)).toEqual({ status: 'ok', database: 'up' });
    expect(context.callbackWaitsForEmptyEventLoop).toBe(false);
  });

  it('reuses the warm app and keeps auth and problem+json', async () => {
    const res = await handler(event('GET', '/v1/products'), context);
    expect(res).toMatchObject({ statusCode: 401 });
    expect(res.headers?.['content-type']).toMatch(/application\/problem\+json/);
  });
});

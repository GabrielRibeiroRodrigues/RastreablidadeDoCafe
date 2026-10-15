#!/usr/bin/env node
// Local smoke test of the bundled Lambdas (run `pnpm bundle:lambda` first).
//
// 1. Invokes dist-lambda/migrate (applies migrations to DATABASE_URL).
// 2. Loads dist-lambda/api and sends fake API Gateway HTTP API (payload v2) events, printing the
//    cold-start (import + first request) and warm timings.
//
// Usage: DATABASE_URL=postgresql://... node scripts/smoke-lambda.mjs [path ...]
// The API runs with AUTH_MODE=mock / NODE_ENV=development unless you override the env.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const outRoot = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist-lambda');
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/v1/health', '/v1/health'];

process.env.NODE_ENV ??= 'development';
process.env.AUTH_MODE ??= 'mock';
process.env.SWAGGER_ENABLED ??= 'false';
process.env.DATABASE_POOL_MAX ??= '2';
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (e.g. the docker compose Postgres).');
  process.exit(1);
}

const context = () => ({
  awsRequestId: crypto.randomUUID(),
  functionName: 'local',
  getRemainingTimeInMillis: () => 29_000,
  callbackWaitsForEmptyEventLoop: true,
});

const migrateEntry = join(outRoot, 'migrate', 'index.mjs');
if (existsSync(migrateEntry)) {
  const { handler } = await import(pathToFileURL(migrateEntry).href);
  console.log('migrate:', await handler({}, context()));
}

let started = performance.now();
const { handler } = await import(pathToFileURL(join(outRoot, 'api', 'index.mjs')).href);
console.log(`api module loaded in ${Math.round(performance.now() - started)} ms`);

for (const path of paths) {
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'localhost', 'user-agent': 'smoke', 'x-request-id': 'smoke-test-0001' },
    requestContext: {
      accountId: '000000000000',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'local',
      http: {
        method: 'GET',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'smoke',
      },
      requestId: crypto.randomUUID(),
      routeKey: '$default',
      stage: '$default',
      time: new Date().toUTCString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  };
  started = performance.now();
  const response = await handler(event, context());
  console.log(
    `GET ${path} -> ${response.statusCode} in ${Math.round(performance.now() - started)} ms`,
    response.body?.slice(0, 200),
  );
}

process.exit(0);

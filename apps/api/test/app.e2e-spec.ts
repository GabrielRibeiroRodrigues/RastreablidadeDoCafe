import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../src/common/http/problem-details.filter.js';
import { createTestApp, type TestApp } from './support/test-app.js';

class ProbeDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}

/** Controller só de teste para exercitar validação e erros inesperados. */
@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() dto: ProbeDto): ProbeDto {
    return dto;
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2');
  }
}

describe('HTTP foundation (e2e)', () => {
  let testApp: TestApp;
  const http = () => testApp.http();

  beforeAll(async () => {
    testApp = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /v1/health returns ok and a generated request id', async () => {
    const res = await http().get('/v1/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a valid incoming x-request-id', async () => {
    const res = await http().get('/v1/health').set('x-request-id', 'trace-abc-12345').expect(200);

    expect(res.headers['x-request-id']).toBe('trace-abc-12345');
  });

  it('replaces an unsafe incoming x-request-id', async () => {
    const res = await http()
      .get('/v1/health')
      .set('x-request-id', 'bad id\twith spaces')
      .expect(200);

    expect(res.headers['x-request-id']).not.toBe('bad id\twith spaces');
  });

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await http().get('/v1/nope').expect(404);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/v1/nope',
    });
    expect((res.body as ProblemDetails).requestId).toBe(res.headers['x-request-id']);
  });

  it('returns field errors on validation failure', async () => {
    const res = await http()
      .post('/v1/probe')
      .send({ name: 'ab', quantity: -1, extra: true })
      .expect(400);

    const body = res.body as ProblemDetails;
    expect(body.type).toBe('/problems/validation-error');
    const fields = (body.errors ?? []).map((e) => e.field).sort();
    expect(fields).toEqual(['extra', 'name', 'quantity']);
  });

  it('transforms and accepts a valid body', async () => {
    await http()
      .post('/v1/probe')
      .send({ name: 'Bourbon Amarelo', quantity: 10 })
      .expect(201, { name: 'Bourbon Amarelo', quantity: 10 });
  });

  it('hides internal error details', async () => {
    const res = await http().get('/v1/probe/boom').expect(500);

    expect((res.body as ProblemDetails).detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('serves the OpenAPI document', async () => {
    const res = await http().get('/docs-json').expect(200);

    const doc = res.body as { info: { title: string }; paths: Record<string, unknown> };
    expect(doc.info.title).toBe('TraceFlow API');
    expect(doc.paths).toHaveProperty('/v1/health');
  });
});

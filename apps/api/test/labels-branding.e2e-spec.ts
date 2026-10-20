import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { bandColors } from '../src/modules/labels/label-pdf.js';
import { LabelsService } from '../src/modules/labels/labels.service.js';
import { TraceService } from '../src/modules/trace/trace.service.js';
import type { StorageService } from '../src/storage/storage.service.js';
import { TenantContext } from '../src/tenancy/tenant-context.js';
import { TenantPrismaService } from '../src/tenancy/tenant-prisma.service.js';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Etiquetas em lote e identidade da empresa (página pública e faixa da etiqueta). */
describe('Batch labels and company branding (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;
  const uploads = new Map<string, Uint8Array>();

  /** Serviço com bucket falso (os testes rodam sem S3). */
  const labels = () =>
    new LabelsService(
      testApp.app.get(TenantPrismaService),
      testApp.app.get(TenantContext),
      {
        isConfigured: true,
        assertConfigured: () => undefined,
        putObject: (key: string, body: Uint8Array) => {
          uploads.set(key, body);
          return Promise.resolve();
        },
        createDownloadUrl: (key: string) =>
          Promise.resolve({ url: `https://bucket.test/${key}`, expiresAt: new Date() }),
      } as unknown as StorageService,
      testApp.app.get(TraceService),
      testApp.app.get(AuditService),
      testApp.app.get(ConfigService),
    );

  const asCompany = <T>(fn: () => Promise<T>) =>
    testApp.app.get(TenantContext).runAs(s.company.id, fn, s.users.admin.id);

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    uploads.clear();
    s = await createScenario(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('prints one page per lot, in the requested order, deduplicated', async () => {
    const lots = [await s.receive('10'), await s.receive('20'), await s.receive('30')];

    const result = await asCompany(() => labels().generateBatch([...lots, lots[0]!]));

    expect(result.count).toBe(3);
    const [key] = [...uploads.keys()];
    expect(key).toMatch(new RegExp(`^${s.company.id}/labels/batch-`));
    const pdf = await PDFDocument.load(uploads.get(key!)!);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toBe('Etiquetas (3 lotes)');

    // Cada lote ganhou o token da página pública.
    const tokens = await testApp.prisma.lot.findMany({
      where: { id: { in: lots } },
      select: { publicToken: true },
    });
    expect(tokens.every((lot) => lot.publicToken)).toBe(true);
    const audit = await testApp.prisma.auditLog.findFirst({
      where: { action: 'label.batch_generated' },
    });
    expect((audit?.after as { lots: string[] }).lots).toHaveLength(3);
  });

  it('refuses the whole batch when one lot belongs to another company', async () => {
    const mine = await s.receive('10');
    const other = await createScenario(testApp, 'Outra Empresa');
    const theirs = await other.receive('10');

    await expect(asCompany(() => labels().generateBatch([mine, theirs]))).rejects.toMatchObject({
      code: 'P2025',
    });
    expect(uploads.size).toBe(0);
  });

  it('validates the batch request over HTTP (size and ids)', async () => {
    const tooMany = Array.from({ length: 51 }, () => s.company.id);
    expect((await s.http.post('/v1/labels/batch', { lotIds: tooMany })).status).toBe(400);
    expect((await s.http.post('/v1/labels/batch', { lotIds: [] })).status).toBe(400);
    expect((await s.http.post('/v1/labels/batch', { lotIds: ['x'] })).status).toBe(400);
    expect((await s.http.post('/v1/labels/batch', { lotIds: [] }, 'auditor')).status).toBe(403);
  });

  it('admins set the brand, which shows on the public page', async () => {
    const res = await s.http
      .patch('/v1/companies/me', {
        brandColor: '#5B3A29',
        tagline: '  Cafés especiais da Mantiqueira ',
        website: 'https://serraazul.example',
      })
      .expect(200);
    expect(res.body).toMatchObject({
      name: s.company.name,
      brandColor: '#5b3a29',
      tagline: 'Cafés especiais da Mantiqueira',
    });

    const lot = await s.receive('10');
    await testApp.prisma.lot.update({
      where: { id: lot },
      data: { publicToken: 'brandTokenForTests_0001' },
    });
    const page = await testApp.http().get('/v1/public/trace/brandTokenForTests_0001').expect(200);
    expect(page.body).toMatchObject({
      brand: {
        color: '#5b3a29',
        tagline: 'Cafés especiais da Mantiqueira',
        website: 'https://serraazul.example',
      },
    });
  });

  it('validates brand fields and keeps them admin-only', async () => {
    for (const body of [
      { brandColor: 'red' },
      { brandColor: '#12345' },
      { website: 'http://inseguro.example' },
      { website: 'javascript:alert(1)' },
      { tagline: 'x'.repeat(141) },
    ]) {
      expect((await s.http.patch('/v1/companies/me', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(
      (await s.http.patch('/v1/companies/me', { brandColor: '#000000' }, 'operator')).status,
    ).toBe(403);
    // null limpa o campo.
    await s.http.patch('/v1/companies/me', { brandColor: '#123456' }).expect(200);
    const cleared = await s.http.patch('/v1/companies/me', { brandColor: null }).expect(200);
    expect((cleared.body as { brandColor: string | null }).brandColor).toBeNull();
  });

  it('picks a readable ink for the label band', () => {
    const darkInk = bandColors('#ffffff').ink;
    const lightInk = bandColors('#000000').ink;
    expect(darkInk).not.toEqual(lightInk);
    expect(bandColors('#f5d76e').ink).toEqual(darkInk); // amarelo claro → texto escuro
    expect(bandColors('#5b3a29').ink).toEqual(lightInk); // café escuro → texto claro
    expect(bandColors(null).ink).toEqual(lightInk); // padrão: faixa espresso
  });
});

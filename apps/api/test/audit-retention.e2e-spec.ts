import { ConfigService } from '@nestjs/config';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditRetentionService } from '../src/modules/audit/audit-retention.service.js';
import type { StorageService } from '../src/storage/storage.service.js';
import { TenantContext } from '../src/tenancy/tenant-context.js';
import { TenantPrismaService } from '../src/tenancy/tenant-prisma.service.js';
import { resetDatabase } from './support/database.js';
import { factories } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Retenção da auditoria: arquiva no bucket e só então remove; o trigger protege o resto. */
describe('Audit retention (e2e)', () => {
  let testApp: TestApp;
  let companyA: string;
  let companyB: string;
  const uploads = new Map<string, Buffer>();

  /** Bucket falso: guarda o que seria enviado ao S3. */
  const fakeStorage = (configured = true) =>
    ({
      isConfigured: configured,
      putObject: (key: string, body: Uint8Array) => {
        uploads.set(key, Buffer.from(body));
        return Promise.resolve();
      },
    }) as unknown as StorageService;

  const service = (storage = fakeStorage()) =>
    new AuditRetentionService(
      testApp.app.get(TenantPrismaService),
      testApp.app.get(TenantContext),
      storage,
      testApp.app.get(ConfigService),
    );

  const runAs = <T>(companyId: string, fn: () => Promise<T>) =>
    testApp.app.get(TenantContext).runAs(companyId, fn);

  /** Insere um registro com idade arbitrária (o app sempre grava `now()`). */
  const insertAudit = (companyId: string, daysAgo: number, action = 'lot.received') =>
    testApp.prisma.$executeRaw`
      INSERT INTO audit_logs (id, company_id, action, entity_type, created_at)
      VALUES (gen_random_uuid(), ${companyId}::uuid, ${action}, 'lot',
              now() - ${daysAgo} * interval '1 day')`;

  const count = (companyId: string) => testApp.prisma.auditLog.count({ where: { companyId } });

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    uploads.clear();
    const make = factories(testApp.prisma);
    companyA = (await make.company({ name: 'Empresa A' })).id;
    companyB = (await make.company({ name: 'Empresa B' })).id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('archives records older than the retention, then deletes them', async () => {
    await insertAudit(companyA, 2000, 'recall.created');
    await insertAudit(companyA, 1900);
    await insertAudit(companyA, 30);
    await insertAudit(companyB, 2000);

    const result = await runAs(companyA, () => service().archiveExpired());

    expect(result).toMatchObject({ archived: 2, skippedNoStorage: false });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatch(new RegExp(`^${companyA}/audit-archive/.+\\.jsonl\\.gz$`));

    const lines = gunzipSync(uploads.get(result.files[0]!)!).toString().trim().split('\n');
    expect(lines.map((line) => (JSON.parse(line) as { action: string }).action)).toEqual([
      'recall.created',
      'lot.received',
    ]);
    // Só os antigos da empresa A saíram; a empresa B não foi tocada.
    expect(await count(companyA)).toBe(1);
    expect(await count(companyB)).toBe(1);
  });

  it('keeps everything when there is no bucket to archive to', async () => {
    await insertAudit(companyA, 2000);
    const result = await runAs(companyA, () => service(fakeStorage(false)).archiveExpired());

    expect(result).toMatchObject({ archived: 0, skippedNoStorage: true });
    expect(await count(companyA)).toBe(1);
  });

  it('keeps the records if the upload fails', async () => {
    await insertAudit(companyA, 2000);
    const failing = {
      isConfigured: true,
      putObject: () => Promise.reject(new Error('S3 down')),
    } as unknown as StorageService;

    await expect(runAs(companyA, () => service(failing).archiveExpired())).rejects.toThrow(
      'S3 down',
    );
    expect(await count(companyA)).toBe(1);
  });

  it('the trigger still forbids updates and deletes outside the retention job', async () => {
    await insertAudit(companyA, 2000);
    await insertAudit(companyA, 10);

    await expect(testApp.prisma.$executeRawUnsafe('DELETE FROM audit_logs')).rejects.toThrow(
      /append-only/,
    );
    await expect(
      testApp.prisma.$executeRawUnsafe("UPDATE audit_logs SET action = 'x'"),
    ).rejects.toThrow(/append-only/);

    // Mesmo com a flag, registro com menos de 1 ano não sai.
    await expect(
      testApp.prisma.$transaction([
        testApp.prisma.$executeRawUnsafe(
          "SELECT set_config('traceflow.audit_retention', 'on', true)",
        ),
        testApp.prisma.$executeRawUnsafe(
          "DELETE FROM audit_logs WHERE created_at > now() - interval '30 days'",
        ),
      ]),
    ).rejects.toThrow(/append-only/);
    expect(await count(companyA)).toBe(2);
  });
});

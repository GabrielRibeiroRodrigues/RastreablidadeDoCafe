import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import type { TestApp } from './support/test-app.js';

const BUCKET = 'traceflow-test';
const ACCESS_KEY = 'traceflow';
const SECRET_KEY = 'traceflow-secret';

/**
 * Anexos, etiqueta e relatório do recall com um bucket de verdade (MinIO, a mesma imagem do
 * docker-compose): upload pelo formulário pré-assinado, confirmação, download e PDFs gerados.
 * Os outros arquivos rodam sem bucket; aqui o S3 é configurado só para este processo.
 */
describe('Storage: attachments, labels and recall report (e2e)', () => {
  let minio: StartedTestContainer;
  let testApp: TestApp;
  let s: Scenario;

  beforeAll(async () => {
    minio = await new GenericContainer('pgsty/minio:RELEASE.2026-08-04T00-00-00Z')
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: ACCESS_KEY, MINIO_ROOT_PASSWORD: SECRET_KEY })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start();
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

    await new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    }).send(new CreateBucketCommand({ Bucket: BUCKET }));

    Object.assign(process.env, {
      S3_BUCKET: BUCKET,
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: 'true',
      S3_ACCESS_KEY_ID: ACCESS_KEY,
      S3_SECRET_ACCESS_KEY: SECRET_KEY,
    });
    // Import dinâmico: o ConfigModule valida o ambiente ao importar o AppModule, então o S3
    // precisa estar no process.env antes (senão S3_FORCE_PATH_STYLE fica no padrão, false).
    const { createTestApp } = await import('./support/test-app.js');
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    s = await createScenario(testApp);
  });

  afterAll(async () => {
    await testApp?.close();
    await minio?.stop();
  });

  const pdfBytes = async (url: string) => {
    const res = await fetch(url);
    expect(res.status).toBe(200);
    return Buffer.from(await res.arrayBuffer());
  };

  it('uploads through the presigned form, confirms, lists and downloads an attachment', async () => {
    const lotId = await s.receive('100');
    const content = Buffer.from('%PDF-1.4\nlaudo de classificação\n%%EOF\n');

    const requested = await s.http
      .post(`/v1/lots/${lotId}/attachments`, {
        fileName: 'laudo.pdf',
        contentType: 'application/pdf',
        sizeBytes: content.length,
      })
      .expect(201);
    const { attachment, upload } = requested.body as {
      attachment: { id: string; status: string };
      upload: { url: string; fields: Record<string, string> };
    };
    expect(attachment.status).toBe('PENDING');

    // Antes do upload, confirmar é recusado.
    await s.http.post(`/v1/lots/${lotId}/attachments/${attachment.id}/confirm`).expect(409);

    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append('file', new Blob([content], { type: 'application/pdf' }), 'laudo.pdf');
    const posted = await fetch(upload.url, { method: 'POST', body: form });
    expect(posted.status).toBeLessThan(300);

    await s.http.post(`/v1/lots/${lotId}/attachments/${attachment.id}/confirm`).expect(200);
    const list = await s.http.get(`/v1/lots/${lotId}/attachments`).expect(200);
    expect((list.body as Array<{ id: string; status: string }>).map((a) => a.status)).toEqual([
      'UPLOADED',
    ]);

    const download = await s.http
      .get(`/v1/lots/${lotId}/attachments/${attachment.id}/download`)
      .expect(200);
    expect(await pdfBytes((download.body as { url: string }).url)).toEqual(content);
  });

  it('rejects a file larger than declared (the presigned form enforces the size)', async () => {
    const lotId = await s.receive('100');
    const requested = await s.http
      .post(`/v1/lots/${lotId}/attachments`, {
        fileName: 'foto.png',
        contentType: 'image/png',
        sizeBytes: 10,
      })
      .expect(201);
    const { upload } = requested.body as {
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append('file', new Blob([Buffer.alloc(5000)], { type: 'image/png' }), 'foto.png');
    const posted = await fetch(upload.url, { method: 'POST', body: form });
    expect(posted.status).toBeGreaterThanOrEqual(400);
  });

  it('generates the label PDF with a stable public link', async () => {
    const lotId = await s.receive('100');
    const first = (await s.http.post(`/v1/lots/${lotId}/label`).expect(200)).body as {
      url: string;
      publicUrl: string;
    };
    expect((await pdfBytes(first.url)).subarray(0, 5).toString()).toBe('%PDF-');
    expect(first.publicUrl).toMatch(/\/rastreio\/[A-Za-z0-9_-]{22}$/);

    const second = (await s.http.post(`/v1/lots/${lotId}/label`).expect(200)).body as {
      publicUrl: string;
    };
    expect(second.publicUrl).toBe(first.publicUrl);

    const token = first.publicUrl.split('/').pop()!;
    await testApp.http().get(`/v1/public/trace/${token}`).expect(200);
  });

  it('stores the recall report PDF', async () => {
    const lotId = await s.receive('100');
    const recall = (
      await s.http
        .post('/v1/recalls', { lotId, reason: 'Ocratoxina acima do limite', severity: 'HIGH' })
        .expect(201)
    ).body as { id: string; steps: Array<{ name: string; status: string }> };
    expect(recall.steps.find((step) => step.name === 'REPORT')?.status).toBe('COMPLETED');

    const report = await s.http.get(`/v1/recalls/${recall.id}/report`).expect(200);
    const pdf = await pdfBytes((report.body as { url: string }).url);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

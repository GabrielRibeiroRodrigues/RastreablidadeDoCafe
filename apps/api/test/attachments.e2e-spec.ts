import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Remoção de anexo enviado por engano: sai da lista, mas o registro (e o arquivo) ficam. */
describe('Attachment removal (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;
  let lotId: string;
  let attachmentId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    s = await createScenario(testApp);
    lotId = await s.receive('100');
    // Sem bucket nos testes: o anexo já confirmado é criado direto no banco.
    const attachment = await testApp.prisma.attachment.create({
      data: {
        companyId: s.company.id,
        lotId,
        fileName: 'laudo-errado.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        storageKey: `${s.company.id}/lots/${lotId}/test`,
        status: 'UPLOADED',
        uploadedById: s.users.operator.id,
        uploadedAt: new Date(),
      },
    });
    attachmentId = attachment.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  const remove = (as: 'admin' | 'operator' = 'admin', reason = 'Laudo enviado no lote errado') =>
    s.http.post(`/v1/lots/${lotId}/attachments/${attachmentId}/remove`, { reason }, as);

  it('marks the attachment as removed, with who, when and why, and audits it', async () => {
    await remove().expect(204);

    const row = await testApp.prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(row).toMatchObject({
      status: 'REMOVED',
      removedById: s.users.admin.id,
      removeReason: 'Laudo enviado no lote errado',
    });
    expect(row.removedAt).toBeInstanceOf(Date);

    const audit = await testApp.prisma.auditLog.findFirst({
      where: { action: 'attachment.removed', entityId: lotId },
    });
    expect(audit?.after).toMatchObject({ attachment: 'laudo-errado.pdf' });

    // Já removido: não existe mais para a API.
    await remove().expect(404);
  });

  it('is admin-only, needs a reason and is isolated per company', async () => {
    await remove('operator').expect(403);
    await remove('admin', 'x').expect(400);

    const other = await createScenario(testApp, 'Outra Empresa');
    await other.http
      .post(`/v1/lots/${lotId}/attachments/${attachmentId}/remove`, { reason: 'Empresa errada' })
      .expect(404);
    expect(
      (await testApp.prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })).status,
    ).toBe('UPLOADED');
  });
});

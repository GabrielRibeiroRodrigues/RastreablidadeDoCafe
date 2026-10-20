import type { Page } from '@playwright/test';
import { api, expect, first, login, test } from './support';

interface Ref {
  id: string;
}
interface Lot {
  id: string;
  code: string;
}

/** Recebe um lote de café verde pela API (dado novo por teste, sem depender da ordem). */
async function receiveLot(quantity = '50'): Promise<Lot> {
  const [product, location, supplier] = await Promise.all([
    first<Ref>('/v1/products?type=GREEN'),
    first<Ref>('/v1/locations?type=WAREHOUSE'),
    first<Ref>('/v1/suppliers'),
  ]);
  return api<Lot>('/v1/receipts', {
    method: 'POST',
    body: JSON.stringify({
      productId: product.id,
      locationId: location.id,
      supplierId: supplier.id,
      quantity,
      harvest: '2025/26',
    }),
  });
}

const toast = (page: Page, text: RegExp) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text }).first();

test.describe('stock', () => {
  test('receives a lot in the form and opens its page', async ({ page }) => {
    await login(page, 'operator');
    await page.goto('/recebimento');
    const product = page.getByRole('combobox', { name: /Produto/ });
    await product.click();
    await page.getByRole('option').first().click();
    await page.getByRole('combobox', { name: /Fornecedor/ }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('combobox', { name: /Local de destino/ }).click();
    await page.getByRole('option').first().click();
    await page.getByLabel(/Quantidade/).fill('12,5');
    await page.getByLabel('Safra').fill('2025/26');
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();

    await expect(toast(page, /recebido/)).toBeVisible();
    await page.waitForURL(/\/lotes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/-\d{4}-\d{6}/);
  });

  test('refuses an issue above the balance and accepts one that fits', async ({ page, watch }) => {
    // O 409 da API é esperado e aparece no console do navegador.
    watch.allowConsole.push(/409/);
    const lot = await receiveLot('20');
    await login(page, 'operator');
    await page.goto(`/lotes/${lot.id}`);

    await page.getByRole('button', { name: 'Movimentar' }).click();
    await page.getByLabel(/Quantidade/).fill('25');
    await page.getByRole('button', { name: /Registrar saída/ }).click();
    await expect(page.getByText(/Saldo insuficiente/).first()).toBeVisible();

    await page.getByLabel(/Quantidade/).fill('5');
    await page.getByRole('button', { name: /Registrar saída/ }).click();
    await expect(toast(page, /registrada/)).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText(/^15 (sc|kg)$/).first()).toBeVisible();
  });
});

test.describe('corrections', () => {
  test('an admin cancels a shipment and the stock comes back', async ({ page }) => {
    const lot = await receiveLot('40');
    const [customer, location] = await Promise.all([
      first<Ref>('/v1/customers'),
      first<Ref>('/v1/locations?type=WAREHOUSE'),
    ]);
    const shipment = await api<{ id: string; number: string }>('/v1/shipments', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ lotId: lot.id, locationId: location.id, quantity: '10' }],
      }),
    });

    await login(page, 'admin');
    await page.goto(`/expedicao/${shipment.id}`);
    await page.getByRole('button', { name: 'Cancelar expedição' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Motivo/).fill('Pedido cancelado pelo cliente (e2e)');
    await dialog.getByRole('button', { name: 'Cancelar operação' }).click();

    await expect(toast(page, /cancelada/)).toBeVisible();
    await expect(page.getByText('As saídas foram estornadas', { exact: false })).toBeVisible();
    const after = await api<{ balance: string }>(`/v1/lots/${lot.id}`);
    expect(after.balance).toBe('40.000');
  });

  test('a logged-in user opens a scanned label inside the app', async ({ page }) => {
    const lot = await receiveLot('10');
    const label = await api<{ publicUrl: string }>(`/v1/lots/${lot.id}/label`, {
      method: 'POST',
    }).catch(() => null);
    // Sem bucket no ambiente de teste a etiqueta não é gerada: o fluxo não se aplica.
    test.skip(!label, 'storage not configured');

    await login(page, 'operator');
    await page.goto(new URL(label!.publicUrl).pathname);
    await page.getByRole('link', { name: 'Abrir no sistema' }).click();
    await expect(page).toHaveURL(new RegExp(`/lotes/${lot.id}/rastreabilidade`));
  });
});

test.describe('quality', () => {
  test('executes a recall, blocks the lot and notifies in the bell', async ({ page }) => {
    const lot = await receiveLot('30');
    await login(page, 'admin');
    await page.goto('/recall/novo');
    const combo = page.getByRole('combobox').first();
    await combo.click();
    await combo.fill(lot.code);
    await page
      .getByRole('option', { name: new RegExp(lot.code) })
      .first()
      .click();
    await page.getByRole('button', { name: 'Simular impacto' }).click();
    await page.getByLabel(/Motivo/).fill('Teste de ponta a ponta: contaminação suspeita');
    await page.getByRole('radio', { name: /Alta/ }).click();
    await page.getByRole('button', { name: 'Executar recall' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill(lot.code);
    await dialog.getByRole('button', { name: 'Executar recall' }).click();

    await page.waitForURL(/\/recall\/[0-9a-f-]{36}$/);
    const recallUrl = page.url();
    await expect(page.getByText('Executado').first()).toBeVisible();

    const blocked = await api<{ status: string }>(`/v1/lots/${lot.id}`);
    expect(blocked.status).toBe('BLOCKED');

    // A central de avisos traz o recall e leva até ele.
    await page.goto('/');
    await page.getByRole('button', { name: /^Avisos/ }).click();
    await page
      .getByRole('menuitem', { name: /Recall .*1 lote bloqueado/ })
      .first()
      .click();
    await expect(page).toHaveURL(recallUrl);
  });
});

test.describe('access', () => {
  test('an admin invites a user who then appears in the list', async ({ page }) => {
    const email = `e2e-${Date.now()}@serraazul.dev`;
    await login(page, 'admin');
    await page.goto('/usuarios');
    await page.getByRole('button', { name: 'Convidar usuário' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('E-mail').fill(email);
    await dialog.getByLabel('Nome').fill('Pessoa de Teste');
    await dialog.getByRole('button', { name: /Salvar|Convidar|Criar/ }).click();

    await expect(page.getByRole('cell', { name: email })).toBeVisible();
    // A própria admin não tem o botão de desativar na própria linha.
    const ownRow = page.getByRole('row').filter({ hasText: '(você)' });
    await expect(ownRow.getByRole('button', { name: /Desativar/ })).toHaveCount(0);
  });

  test('the auditor sees screens read-only and no admin menus', async ({ page }) => {
    await login(page, 'auditor');
    await page.goto('/produtos');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Produtos');
    await expect(page.getByRole('button', { name: 'Novo produto' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Auditoria' }).first()).toBeVisible();
  });
});

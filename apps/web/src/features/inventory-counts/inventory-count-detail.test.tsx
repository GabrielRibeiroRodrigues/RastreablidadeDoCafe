import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { parseCountInput } from '@/lib/quantity';
import { json, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signInAs } from '@/test/session';
import type { InventoryCountDetail, InventoryCountItem } from './api';

const ID = '0b6c1b8e-0000-4000-8000-0000000000a1';

function item(code: string, overrides: Partial<InventoryCountItem> = {}): InventoryCountItem {
  return {
    id: `item-${code}`,
    lot: { id: `lot-${code}`, code, status: 'AVAILABLE' },
    product: { id: 'p-1', sku: 'VRD-01', name: 'Café verde', type: 'GREEN' },
    unit: 'KG',
    systemQuantity: '100.000',
    currentQuantity: '100.000',
    countedQuantity: null,
    difference: null,
    countedBy: null,
    countedAt: null,
    adjustmentId: null,
    ...overrides,
  };
}

function count(items: InventoryCountItem[]): InventoryCountDetail {
  return {
    id: ID,
    number: 'INV-2026-000001',
    status: 'OPEN',
    location: { id: 'loc-1', code: 'ARM-01', name: 'Armazém', type: 'WAREHOUSE' },
    notes: null,
    itemsCount: items.length,
    countedCount: items.filter((i) => i.countedQuantity !== null).length,
    createdBy: { id: 'u-1', name: 'Ana Ribeiro' },
    createdAt: '2026-10-20T12:00:00.000Z',
    appliedBy: null,
    appliedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    items,
  };
}

describe('Contagem de inventário', () => {
  it('parses counted quantities, zero included', () => {
    expect(parseCountInput('0')).toBe('0');
    expect(parseCountInput('97,5')).toBe('97.5');
    expect(parseCountInput('-1')).toBeNull();
    expect(parseCountInput('1,2345')).toBeNull();
  });

  it('saves what the operator typed and shows the difference; only admins apply', async () => {
    signInAs('operator');
    let current = count([item('CAF-2026-000001')]);
    const api = mockApi({
      'GET /v1/inventory-counts/:id': () => json(current),
      'PUT /v1/inventory-counts/:id/items/:itemId': async (request) => {
        const { countedQuantity } = (await request.json()) as { countedQuantity: string };
        current = count([
          item('CAF-2026-000001', { countedQuantity: '97.500', difference: '-2.500' }),
        ]);
        expect(countedQuantity).toBe('97.5');
        return json(current);
      },
    });
    const user = userEvent.setup();

    renderApp({ path: `/inventario/${ID}` });
    const input = await screen.findByLabelText('Quantidade contada de CAF-2026-000001');
    await user.type(input, '97,5{Enter}');

    await waitFor(() =>
      expect(api.find('PUT', `/v1/inventory-counts/${ID}/items/item-CAF-2026-000001`)).toHaveLength(
        1,
      ),
    );
    expect(await screen.findByText('−2,5 kg')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument();
  });

  it('lets an admin apply only when every lot is counted, with a summary', async () => {
    signInAs('admin');
    const api = mockApi({
      'GET /v1/inventory-counts/:id': () =>
        json(
          count([
            item('CAF-2026-000001', { countedQuantity: '97.500', difference: '-2.500' }),
            item('CAF-2026-000002', { countedQuantity: '100.000', difference: '0.000' }),
          ]),
        ),
      'POST /v1/inventory-counts/:id/apply': () =>
        json({ ...count([]), status: 'APPLIED', appliedAt: '2026-10-20T13:00:00.000Z' }),
    });
    const user = userEvent.setup();

    renderApp({ path: `/inventario/${ID}` });
    await user.click(await screen.findByRole('button', { name: 'Aplicar' }));
    const dialog = await screen.findByRole('dialog', { name: /Aplicar INV-2026-000001/ });
    expect(within(dialog).getByText('1 ajuste será lançado')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar contagem' }));

    await waitFor(() =>
      expect(api.find('POST', `/v1/inventory-counts/${ID}/apply`)).toHaveLength(1),
    );
  });

  it('keeps Apply disabled while lots are uncounted', async () => {
    signInAs('admin');
    mockApi({ 'GET /v1/inventory-counts/:id': () => json(count([item('CAF-2026-000001')])) });

    renderApp({ path: `/inventario/${ID}` });
    expect(await screen.findByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(screen.getByText('0 de 1 lotes contados')).toBeInTheDocument();
  });

  it('is read-only for auditors', async () => {
    signInAs('auditor');
    mockApi({ 'GET /v1/inventory-counts/:id': () => json(count([item('CAF-2026-000001')])) });

    renderApp({ path: `/inventario/${ID}` });
    expect(await screen.findByText('CAF-2026-000001')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantidade contada/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Incluir lote' })).not.toBeInTheDocument();
  });
});

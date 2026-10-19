import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signInAs } from '@/test/session';
import type { ShipmentDetail } from './api';

const ID = '0b6c1b8e-0000-4000-8000-0000000000e1';

function shipment(overrides: Partial<ShipmentDetail> = {}): ShipmentDetail {
  return {
    id: ID,
    number: 'EXP-2026-000004',
    customer: {
      id: '0b6c1b8e-0000-4000-8000-0000000000c1',
      name: 'Cafeteria Grão Fino',
      document: null,
      city: 'São Paulo',
      state: 'SP',
    },
    orderRef: 'PED-5602',
    shippedAt: '2026-10-18T20:33:00.000Z',
    notes: null,
    items: [
      {
        lot: { id: 'lot-1', code: 'CAF-2026-000006', status: 'AVAILABLE' },
        product: { id: 'p-1', sku: 'BLD-CASA', name: 'Blend da Casa', type: 'BLEND' },
        location: { id: 'loc-1', code: 'ARM-01', name: 'Armazém', type: 'WAREHOUSE' },
        quantity: '20.000',
        unit: 'KG',
        movementId: 'mov-1',
        reversal: null,
      },
      {
        lot: { id: 'lot-2', code: 'CAF-2026-000005', status: 'AVAILABLE' },
        product: { id: 'p-2', sku: 'TOR-TRAD', name: 'Tradicional', type: 'ROASTED' },
        location: { id: 'loc-1', code: 'ARM-01', name: 'Armazém', type: 'WAREHOUSE' },
        quantity: '5.000',
        unit: 'KG',
        movementId: 'mov-2',
        reversal: { id: 'rev-2', occurredAt: '2026-10-19T10:00:00.000Z' },
      },
    ],
    user: { id: 'u-1', name: 'Ana Ribeiro' },
    cancellation: null,
    createdAt: '2026-10-18T20:33:00.000Z',
    ...overrides,
  };
}

describe('Detalhe da expedição', () => {
  it('marks reversed items and shows the partial reversal', async () => {
    signInAs('auditor');
    mockApi({ 'GET /v1/shipments/:id': () => json(shipment()) });

    renderApp({ path: `/expedicao/${ID}` });

    expect(await screen.findByText('Estorno parcial')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Estornado')).toHaveLength(1);
    // Auditor não cancela.
    expect(screen.queryByRole('button', { name: 'Cancelar expedição' })).not.toBeInTheDocument();
  });

  it('lets an admin cancel with a reason and shows who cancelled', async () => {
    signInAs('admin');
    let current = shipment();
    const api = mockApi({
      'GET /v1/shipments/:id': () => json(current),
      'POST /v1/shipments/:id/cancel': async (request) => {
        const { reason } = (await request.json()) as { reason: string };
        current = shipment({
          cancellation: {
            cancelledAt: '2026-10-19T11:00:00.000Z',
            reason,
            user: { id: 'u-1', name: 'Ana Ribeiro' },
          },
        });
        return json(current);
      },
    });
    const user = userEvent.setup();

    renderApp({ path: `/expedicao/${ID}` });
    await user.click(await screen.findByRole('button', { name: 'Cancelar expedição' }));
    const dialog = await screen.findByRole('dialog', { name: /Cancelar a expedição/ });
    expect(within(dialog).getByText(/A saída do item será estornada/)).toBeInTheDocument();

    // Motivo curto demais: barrado antes da API.
    await user.type(within(dialog).getByLabelText(/Motivo/), 'erro');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar operação' }));
    expect(api.find('POST', `/v1/shipments/${ID}/cancel`)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Motivo/), ' do pedido');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar operação' }));

    await waitFor(() => expect(api.find('POST', `/v1/shipments/${ID}/cancel`)).toHaveLength(1));
    expect(await api.find('POST', `/v1/shipments/${ID}/cancel`)[0]!.json()).toEqual({
      reason: 'erro do pedido',
    });
    expect(await screen.findByText(/As saídas foram estornadas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar expedição' })).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the translated API error', async () => {
    signInAs('admin');
    mockApi({
      'GET /v1/shipments/:id': () => json(shipment()),
      'POST /v1/shipments/:id/cancel': () =>
        json(
          {
            type: '/problems/already-cancelled',
            title: 'Conflict',
            status: 409,
            document: 'EXP-2026-000004',
          },
          409,
        ),
    });
    const user = userEvent.setup();

    renderApp({ path: `/expedicao/${ID}` });
    await user.click(await screen.findByRole('button', { name: 'Cancelar expedição' }));
    const dialog = await screen.findByRole('dialog', { name: /Cancelar a expedição/ });
    await user.type(within(dialog).getByLabelText(/Motivo/), 'Pedido em dobro');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar operação' }));

    expect(
      await within(dialog).findByText('EXP-2026-000004 já foi cancelada. Recarregue a página.'),
    ).toBeInTheDocument();
  });
});

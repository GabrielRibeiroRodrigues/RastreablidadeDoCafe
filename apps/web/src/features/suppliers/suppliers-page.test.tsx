import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signInAs } from '@/test/session';
import type { Supplier } from './api';

const SUPPLIER: Supplier = {
  id: '0b6c1b8e-0000-4000-8000-000000000001',
  name: 'Cooperativa Alta Mogiana',
  type: 'COOPERATIVE',
  document: '11222333000181',
  farmName: null,
  region: 'Alta Mogiana',
  city: 'Franca',
  state: 'SP',
  altitudeMeters: 1000,
  varieties: ['Mundo Novo', 'Catuaí Vermelho'],
  email: null,
  phone: null,
  isActive: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

function setup() {
  return mockApi({
    'GET /v1/suppliers': () =>
      json({ data: [SUPPLIER], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }),
    'POST /v1/suppliers': async (request) =>
      json({ ...SUPPLIER, ...((await request.json()) as object), id: 'new' }, 201),
  });
}

describe('Fornecedores', () => {
  it('shows formatted documents, origin and varieties', async () => {
    signInAs('auditor');
    setup();

    renderApp({ path: '/fornecedores' });

    const table = await screen.findByRole('table', { name: 'Lista de fornecedores' });
    expect(await within(table).findByText('11.222.333/0001-81')).toBeInTheDocument();
    expect(within(table).getByText('Cooperativa')).toBeInTheDocument();
    expect(within(table).getByText('Franca/SP')).toBeInTheDocument();
    expect(within(table).getByText('Alta Mogiana · 1000 m')).toBeInTheDocument();
    expect(within(table).getByText('Catuaí Vermelho')).toBeInTheDocument();
  });

  it('creates a supplier sending digits-only document/phone, numbers and varieties', async () => {
    signInAs('operator');
    const api = setup();
    const user = userEvent.setup();

    renderApp({ path: '/fornecedores' });
    await user.click(await screen.findByRole('button', { name: 'Novo fornecedor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo fornecedor' });

    await user.type(within(dialog).getByLabelText(/Nome/), 'José Aparecido da Silva');
    const documentInput = within(dialog).getByLabelText('CPF ou CNPJ');
    await user.type(documentInput, '529.982.247-24');
    await user.type(within(dialog).getByLabelText('Altitude (m)'), '1250');
    const varieties = within(dialog).getByLabelText('Variedades');
    await user.type(varieties, 'Bourbon Amarelo{Enter}Catuaí Vermelho,');
    await user.type(within(dialog).getByLabelText('Telefone'), '(35) 99999-0000');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    // Dígito verificador errado: barrado antes da API.
    expect(await within(dialog).findByText('CPF ou CNPJ inválido.')).toBeVisible();
    expect(api.find('POST', '/v1/suppliers')).toHaveLength(0);

    await user.clear(documentInput);
    await user.type(documentInput, '529.982.247-25');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.find('POST', '/v1/suppliers')).toHaveLength(1));
    expect(await api.find('POST', '/v1/suppliers')[0]!.json()).toEqual({
      name: 'José Aparecido da Silva',
      type: 'PRODUCER',
      document: '52998224725',
      farmName: null,
      region: null,
      city: null,
      state: null,
      altitudeMeters: 1250,
      varieties: ['Bourbon Amarelo', 'Catuaí Vermelho'],
      email: null,
      phone: '35999990000',
    });
    expect(await screen.findByText('Fornecedor criado.')).toBeInTheDocument();
  });
});

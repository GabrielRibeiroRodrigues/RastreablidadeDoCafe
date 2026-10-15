import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, type MockRoutes } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signInAs } from '@/test/session';
import type { Product } from './api';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    sku: 'VRD-BOURBON-AM',
    name: 'Café verde Bourbon Amarelo',
    type: 'GREEN',
    unit: 'BAG_60KG',
    defaultRoastLevel: null,
    description: null,
    isActive: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

const ROWS = [
  product(),
  product({
    sku: 'BLD-CASA',
    name: 'Blend da Casa',
    type: 'BLEND',
    unit: 'KG',
    defaultRoastLevel: 'MEDIUM',
  }),
];

function page(data: Product[], { page = 1, total = data.length, pageSize = 20 } = {}) {
  return json({ data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

const ME = {
  id: 'u1',
  email: 'ana@serraazul.dev',
  name: 'Ana',
  roles: ['admin'],
  company: { id: 'c1', name: 'Torrefação Serra Azul' },
};

function setup(routes: MockRoutes = {}) {
  return mockApi({
    'GET /v1/me': () => json(ME),
    'GET /v1/products': (_request, url) =>
      page(ROWS, { page: Number(url.searchParams.get('page') ?? 1), total: 45 }),
    ...routes,
  });
}

describe('Produtos', () => {
  it('lists products from the API with server-side pagination', async () => {
    signInAs('admin');
    const api = setup();
    const user = userEvent.setup();

    const { router } = renderApp({ path: '/produtos' });

    const table = await screen.findByRole('table', { name: 'Lista de produtos' });
    expect(await within(table).findByText('Café verde Bourbon Amarelo')).toBeInTheDocument();
    expect(within(table).getByText('Saca (60 kg)')).toBeInTheDocument();
    expect(within(table).getByText('Média')).toBeInTheDocument();
    expect(screen.getByText('1–20 de 45')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();

    const [first] = api.find('GET', '/v1/products');
    const query = new URL(first!.url).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      page: '1',
      pageSize: '20',
      status: 'active',
      sort: 'name',
    });

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?page=2');
    expect(new URL(api.find('GET', '/v1/products').at(-1)!.url).searchParams.get('page')).toBe('2');
  });

  it('sends the debounced search, filters and sort to the API and keeps them in the URL', async () => {
    signInAs('auditor');
    const api = setup();
    const user = userEvent.setup();

    const { router } = renderApp({ path: '/produtos?page=2' });
    await screen.findByText('Blend da Casa');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'bourbon');

    await waitFor(() => expect(router.state.location.search).toBe('?q=bourbon'));
    const lastQuery = () => new URL(api.find('GET', '/v1/products').at(-1)!.url).searchParams;
    await waitFor(() => expect(lastQuery().get('q')).toBe('bourbon'));
    expect(lastQuery().get('page')).toBe('1');

    await user.click(screen.getByRole('button', { name: /SKU/ }));
    await waitFor(() => expect(lastQuery().get('sort')).toBe('sku'));
    await user.click(screen.getByRole('button', { name: /SKU/ }));
    await waitFor(() => expect(lastQuery().get('sort')).toBe('-sku'));

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(lastQuery().get('status')).toBe('all'));
    expect(router.state.location.search).toBe('?q=bourbon&sort=-sku&status=all');
  });

  it('shows an error state with retry', async () => {
    signInAs('admin');
    let calls = 0;
    setup({
      'GET /v1/products': () => {
        calls += 1;
        return calls === 1
          ? json({ title: 'Internal Server Error', status: 500, requestId: 'abc-123' }, 500)
          : page(ROWS);
      },
    });
    const user = userEvent.setup();

    renderApp({ path: '/produtos' });

    expect(await screen.findByText('Não foi possível carregar a lista')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(await screen.findByText('Blend da Casa')).toBeInTheDocument();
  });

  it('maps a duplicated SKU (409) and validation errors (400) to the form fields', async () => {
    signInAs('operator');
    let attempt = 0;
    const api = setup({
      'POST /v1/products': () => {
        attempt += 1;
        return attempt === 1
          ? json(
              {
                type: 'about:blank',
                title: 'Conflict',
                status: 409,
                detail: 'A record with the same unique value already exists.',
                errors: [{ field: 'sku', messages: ['must be unique'] }],
              },
              409,
            )
          : json(
              {
                type: '/problems/validation-error',
                title: 'Validation error',
                status: 400,
                errors: [
                  {
                    field: 'description',
                    messages: ['description must be shorter than or equal to 500 characters'],
                  },
                ],
              },
              400,
            );
      },
    });
    const user = userEvent.setup();

    renderApp({ path: '/produtos' });
    await user.click(await screen.findByRole('button', { name: 'Novo produto' }));

    const dialog = await screen.findByRole('dialog', { name: 'Novo produto' });
    await user.type(within(dialog).getByLabelText(/SKU/), 'vrd-bourbon-am');
    await user.type(within(dialog).getByLabelText(/Nome/), 'Outro café');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText('Já existe um cadastro com este valor.')).toBeVisible();
    expect(within(dialog).getByLabelText(/SKU/)).toHaveAttribute('aria-invalid', 'true');
    const [created] = api.find('POST', '/v1/products');
    expect(await created!.json()).toEqual({
      sku: 'VRD-BOURBON-AM',
      name: 'Outro café',
      type: 'GREEN',
      unit: 'KG',
      defaultRoastLevel: null,
      description: null,
    });

    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Informe no máximo 500 caracteres.')).toBeVisible();
    expect(within(dialog).getByLabelText(/Descrição/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('validates on the client before calling the API', async () => {
    signInAs('admin');
    const api = setup();
    const user = userEvent.setup();

    renderApp({ path: '/produtos' });
    await user.click(await screen.findByRole('button', { name: 'Novo produto' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/SKU/), 'sku inválido!');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(
      await within(dialog).findByText('Use de 2 a 40 caracteres: letras, números e hífen.'),
    ).toBeVisible();
    expect(within(dialog).getByText('Informe pelo menos 2 caracteres.')).toBeVisible();
    expect(api.find('POST', '/v1/products')).toHaveLength(0);
  });

  it('edits a product with PATCH and refreshes the list', async () => {
    signInAs('operator');
    const target = ROWS[1]!;
    const api = setup({
      'PATCH /v1/products/:id': () => json({ ...target, name: 'Blend da Casa 2' }),
    });
    const user = userEvent.setup();

    renderApp({ path: '/produtos' });
    await user.click(await screen.findByRole('button', { name: 'Editar Blend da Casa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar produto' });
    const name = within(dialog).getByLabelText(/Nome/);
    expect(name).toHaveValue('Blend da Casa');
    expect(within(dialog).getByLabelText(/Grau de torra/)).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'Blend da Casa 2');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Produto atualizado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [patch] = api.find('PATCH', `/v1/products/${target.id}`);
    expect(await patch!.json()).toMatchObject({
      name: 'Blend da Casa 2',
      defaultRoastLevel: 'MEDIUM',
    });
    // Lista recarregada após salvar.
    await waitFor(() => expect(api.find('GET', '/v1/products').length).toBeGreaterThan(1));
  });

  it('lets an admin deactivate after confirming', async () => {
    signInAs('admin');
    const target = ROWS[0]!;
    const api = setup({
      'POST /v1/products/:id/deactivate': () => json({ ...target, isActive: false }),
    });
    const user = userEvent.setup();

    renderApp({ path: '/produtos' });
    await user.click(await screen.findByRole('button', { name: `Desativar ${target.name}` }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Desativar produto?' });
    await user.click(within(confirm).getByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('Produto desativado.')).toBeInTheDocument();
    expect(api.find('POST', `/v1/products/${target.id}/deactivate`)).toHaveLength(1);
  });

  it('is read-only for auditors', async () => {
    signInAs('auditor');
    setup();

    renderApp({ path: '/produtos' });

    expect(await screen.findByText('Blend da Casa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo produto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Desativar/ })).not.toBeInTheDocument();
  });

  it('lets operators create and edit but not deactivate', async () => {
    signInAs('operator');
    setup();

    renderApp({ path: '/produtos' });

    expect(await screen.findByText('Blend da Casa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo produto' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Editar/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Desativar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reativar/ })).not.toBeInTheDocument();
  });

  it('shows the company from GET /v1/me in the header', async () => {
    signInAs('admin');
    setup({
      'GET /v1/me': () => json({ ...ME, company: { id: 'c2', name: 'Empresa da API' } }),
    });

    renderApp({ path: '/produtos' });

    expect(await screen.findAllByText('Empresa da API')).not.toHaveLength(0);
  });
});

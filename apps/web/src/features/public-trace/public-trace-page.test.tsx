import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signInAs } from '@/test/session';
import type { PublicTrace } from './api';

const TOKEN = 'lTaAdzF4gELdowsEi1d9iQ';

function trace(overrides: Partial<PublicTrace> = {}): PublicTrace {
  return {
    companyName: 'Torrefação Serra Azul',
    brand: { color: null, tagline: null, website: null },
    lot: {
      code: 'CAF-2026-000004',
      productName: 'Serra Azul Especial (torrado)',
      productType: 'ROASTED',
      harvest: '2026',
      variety: 'Bourbon Amarelo',
      roastLevel: 'MEDIUM_LIGHT',
      producedAt: '2026-10-12T20:29:00.000Z',
      expiresAt: '2027-03-17',
      cuppingScore: 86,
      available: true,
    },
    origins: [],
    chain: [],
    truncated: false,
    recall: null,
    ...overrides,
  };
}

describe('Página pública de rastreio', () => {
  it('shows the lot without any recall notice', async () => {
    mockApi({ 'GET /v1/public/trace/:token': () => json(trace()) });

    renderApp({ path: `/rastreio/${TOKEN}` });

    expect(await screen.findByText('Disponível')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Visitante anônimo: sem a barra interna, só o link discreto que passa pelo login.
    expect(screen.queryByRole('link', { name: 'Abrir no sistema' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir este lote no sistema' })).toHaveAttribute(
      'href',
      '/rastreabilidade?codigo=CAF-2026-000004',
    );
  });

  it('offers a logged-in user a shortcut to the lot inside the app', async () => {
    signInAs('operator');
    mockApi({ 'GET /v1/public/trace/:token': () => json(trace()) });

    renderApp({ path: `/rastreio/${TOKEN}` });

    expect(await screen.findByRole('link', { name: 'Abrir no sistema' })).toHaveAttribute(
      'href',
      '/rastreabilidade?codigo=CAF-2026-000004',
    );
  });

  it('warns the consumer not to use a recalled lot', async () => {
    mockApi({
      'GET /v1/public/trace/:token': () =>
        json(
          trace({
            lot: { ...trace().lot, available: false },
            recall: { since: '2026-10-18T23:34:00.000Z', severity: 'HIGH' },
          }),
        ),
    });

    renderApp({ path: `/rastreio/${TOKEN}` });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Produto recolhido — não consuma');
    expect(alert).toHaveTextContent('Torrefação Serra Azul recolheu este lote');
    expect(screen.getByText('Recolhido')).toBeInTheDocument();
  });
});

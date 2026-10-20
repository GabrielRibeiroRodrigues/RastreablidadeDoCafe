import { expect, login, test } from './support';

/** Todas as telas autenticadas abrem com título, sem erros e sem rolagem horizontal. */
const ROUTES: Array<[string, RegExp]> = [
  ['/', /Painel/],
  ['/recebimento', /recebimento/i],
  ['/producao', /Produção/],
  ['/producao/nova', /Nova ordem/],
  ['/expedicao', /Expedição/],
  ['/expedicao/nova', /Nova expedição/],
  ['/lotes', /Lotes/],
  ['/estoque', /Estoque/],
  ['/movimentacoes', /Movimentações/],
  ['/rastreabilidade', /Rastreabilidade/],
  ['/recall', /Recall/],
  ['/recall/novo', /recall/i],
  ['/qualidade', /Qualidade|Não conformidades/],
  ['/auditoria', /Auditoria/],
  ['/relatorios', /Relatórios/],
  ['/importacao', /Importação/],
  ['/produtos', /Produtos/],
  ['/fornecedores', /Fornecedores/],
  ['/clientes', /Clientes/],
  ['/locais', /Locais/],
  ['/usuarios', /Usuários/],
];

test.describe('screens', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  for (const [path, title] of ROUTES) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, 'rolagem horizontal').toBe(false);
    });
  }

  test('unknown routes show the 404 page', async ({ page }) => {
    await page.goto('/pagina-que-nao-existe');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/não encontrada/i);
  });
});

/**
 * Fuso da operação: "hoje" do painel, períodos dos relatórios, datas impressas e o ano dos códigos
 * (CAF-2026-…, OP-2026-…). Um recebimento em 31/12 às 22h em Brasília é do ano que termina, mesmo
 * já sendo 1º de janeiro em UTC.
 */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const yearFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
});

/** Ano civil de `at` no fuso da operação. */
export const businessYear = (at: Date): number => Number(yearFormat.format(at));

/**
 * Quantidades e datas do estoque. A API trabalha com string decimal com ponto (`"1250.500"`,
 * até 3 casas); a UI exibe em pt-BR (`1.250,5 kg`) e aceita vírgula na digitação.
 */

export type UnitCode = 'KG' | 'BAG_60KG' | 'UNIT';

/** Abreviação da unidade ao lado das quantidades. */
export const UNIT_SHORT: Record<UnitCode, string> = {
  KG: 'kg',
  BAG_60KG: 'sc',
  UNIT: 'un',
};

const QUANTITY_INPUT = /^\d{1,12}([.,]\d{1,3})?$/;

/**
 * Texto digitado → string da API (`"1.250,5"` não é aceito; `"1250,5"` → `"1250.5"`).
 * Devolve `null` se não for uma quantidade positiva com até 3 casas.
 */
export function parseQuantityInput(text: string): string | null {
  const value = text.trim();
  if (!QUANTITY_INPUT.test(value)) return null;
  const normalized = value.replace(',', '.');
  return toMilli(normalized) > 0n ? normalized : null;
}

/** `"12.5"` → `12500n` (milésimos), para comparar sem erro de ponto flutuante. */
export function toMilli(value: string): bigint {
  const [int = '0', frac = ''] = value.trim().replace(',', '.').split('.');
  const negative = int.startsWith('-');
  const digits = `${int.replace('-', '') || '0'}${frac.padEnd(3, '0').slice(0, 3)}`;
  const milli = BigInt(digits);
  return negative ? -milli : milli;
}

const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** `"1250.500"` → `"1.250,5"`; com unidade: `"1.250,5 kg"`. */
export function formatQuantity(value: string, unit?: UnitCode): string {
  const milli = toMilli(value);
  // Number é exato para valores do estoque (até 12 dígitos inteiros + 3 casas).
  const text = quantityFormat.format(Number(milli) / 1000);
  return unit ? `${text} ${UNIT_SHORT[unit]}` : text;
}

/** Mantém as casas que a API enviou: `"40.000"` → `"40,000"`, `"1250.5"` → `"1.250,5"`. */
export function formatQuantityRaw(value: string): string {
  const [int = '0', frac] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac === undefined ? grouped : `${grouped},${frac}`;
}

// ---------------------------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------------------------

/** `"2027-06-30"` → `Date` à meia-noite local (sem o deslocamento de fuso do `new Date(str)`). */
export function parseDateOnly(value: string): Date {
  const [y = 0, m = 1, d = 1] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/** `"2027-06-30"` → `30/06/2027`. */
export function formatDate(value: string | null | undefined): string {
  return value ? dateFormat.format(parseDateOnly(value)) : '';
}

/** ISO → `15/10/2026 14:30` (fuso do navegador). */
export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormat.format(new Date(value)) : '';
}

/** Dias até a validade (negativo = vencido; 0 = vence hoje). */
export function daysUntil(dateOnly: string, today = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDateOnly(dateOnly).getTime() - start.getTime()) / 86_400_000);
}

/** `Date` → valor de `<input type="datetime-local">` (`2026-10-15T14:30`, horário local). */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `"2026-10-15"` (data local) → ISO do início do dia local; `days` desloca a data. */
export function startOfLocalDayIso(dateOnly: string, days = 0): string {
  const date = parseDateOnly(dateOnly);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const isDateOnly = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

// ---------------------------------------------------------------------------------------------
// Massa (rendimento da produção)
// ---------------------------------------------------------------------------------------------

/** `12500n` (milésimos) → `"12.5"` (string decimal da API, sem zeros à direita). */
export function fromMilli(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const int = abs / 1000n;
  const frac = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** Massa em kg (milésimos): 1 saca = 60 kg; quantidades em unidades não têm massa (`null`). */
export function toKgMilli(value: string, unit: UnitCode): bigint | null {
  if (unit === 'KG') return toMilli(value);
  if (unit === 'BAG_60KG') return toMilli(value) * 60n;
  return null;
}

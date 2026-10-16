const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Escolhe a forma da palavra: `plural(1, 'lote', 'lotes')` → "lote". */
export function plural(count: number, one: string, many: string): string {
  return Math.abs(count) === 1 ? one : many;
}

/** Contagem com a palavra concordando: `countOf(3, 'lote', 'lotes')` → "3 lotes". */
export function countOf(count: number, one: string, many: string): string {
  return `${integer.format(count)} ${plural(count, one, many)}`;
}

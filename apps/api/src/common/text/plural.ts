/** Concordância em português: `countOf(3, 'lote', 'lotes')` → "3 lotes"; `countOf(1, …)` → "1 lote". */
export function countOf(count: number, one: string, many: string): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;
}

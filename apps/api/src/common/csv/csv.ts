/**
 * CSV no formato que o Excel em português abre direto: UTF-8 com BOM, separador `;`, decimal com
 * vírgula e quebras de linha CRLF. Também lê CSV (importação) com `;` ou `,`.
 */

export const CSV_SEPARATOR = ';';
const BOM = '﻿';

/** Número já formatado (pt-BR): escrito como está, sem a proteção contra fórmulas. */
export class CsvNumber {
  constructor(readonly text: string) {}
}

export type CsvValue = string | number | CsvNumber | null | undefined;

/** Decimal em texto ("1250.500") → "1250,500". `null` vira célula vazia. */
export function decimalCell(value: { toFixed(digits: number): string } | null, digits = 3) {
  return value === null ? null : new CsvNumber(value.toFixed(digits).replace('.', ','));
}

/**
 * Escapa uma célula. Texto que começa com `=`, `+`, `-`, `@`, TAB ou CR ganha um `'` na frente:
 * sem isso, o Excel interpretaria o conteúdo como fórmula (CSV/formula injection).
 */
export function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof CsvNumber) return value.text;
  if (typeof value === 'number') return String(value).replace('.', ',');

  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text) || text.includes(CSV_SEPARATOR)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Monta o arquivo completo (cabeçalho + linhas), com BOM para o Excel reconhecer UTF-8. */
export function toCsv(header: readonly string[], rows: Iterable<readonly CsvValue[]>): string {
  const lines = [header.map(escapeCell).join(CSV_SEPARATOR)];
  for (const row of rows) lines.push(row.map(escapeCell).join(CSV_SEPARATOR));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

const TIME_ZONE = 'America/Sao_Paulo';
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data e hora no fuso de São Paulo: "15/10/2026 14:30" (o Excel reconhece como data). */
export function dateTimeCell(value: Date | null): string | null {
  if (!value) return null;
  const parts = Object.fromEntries(DATE_TIME.formatToParts(value).map((p) => [p.type, p.value]));
  return `${parts['day']}/${parts['month']}/${parts['year']} ${parts['hour']}:${parts['minute']}`;
}

/** Coluna `date` (sem fuso, gravada em UTC): "2027-06-30" → "30/06/2027". */
export function dateCell(value: Date | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.toISOString().slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Linha lida de um CSV, com o número da linha física onde ela começa (1 = cabeçalho). */
export interface CsvRecord {
  line: number;
  cells: string[];
}

export class CsvParseError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
  }
}

/** Separador do arquivo: o mais frequente (fora de aspas) na primeira linha. */
function detectSeparator(text: string): string {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ';') semicolons++;
    else if (!quoted && char === ',') commas++;
  }
  return commas > semicolons ? ',' : ';';
}

/**
 * Parser RFC 4180 (aspas, aspas dobradas, quebras de linha dentro de aspas, CRLF ou LF).
 * Linhas totalmente vazias são ignoradas. Remove o BOM inicial.
 */
export function parseCsv(input: string): CsvRecord[] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const separator = detectSeparator(text);
  const records: CsvRecord[] = [];

  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;

  const endRecord = () => {
    cells.push(cell);
    if (cells.length > 1 || cells[0]?.trim()) records.push({ line: recordLine, cells });
    cells = [];
    cell = '';
  };

  while (i < text.length) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        if (char === '\n') line++;
        cell += char;
      }
      i++;
      continue;
    }

    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === separator) {
      cells.push(cell);
      cell = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
    }
    i++;
  }
  if (quoted) throw new CsvParseError(recordLine, 'Unterminated quoted field');
  if (cell !== '' || cells.length) endRecord();
  return records;
}

/** Formatos brasileiros usados nos cadastros (CPF/CNPJ, telefone, UF). */

// prettier-ignore
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type Uf = (typeof UFS)[number];

export function isUf(value: unknown): value is Uf {
  return typeof value === 'string' && (UFS as readonly string[]).includes(value);
}

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Mesma regra da API: dígitos verificadores módulo 11, rejeitando dígitos todos iguais. */
export function isValidCpfOrCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (/^(\d)\1*$/.test(digits)) return false;
  if (digits.length === 11) {
    const d1 = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${d1}${d2}`);
  }
  if (digits.length === 14) {
    const d1 = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${d1}${d2}`);
  }
  return false;
}

/** `52998224725` → `529.982.247-25`; `11222333000181` → `11.222.333/0001-81`. */
export function formatDocument(value: string | null | undefined): string {
  if (!value) return '';
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

/** `11988887777` → `(11) 98888-7777`; `1133334444` → `(11) 3333-4444`. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return value;
}

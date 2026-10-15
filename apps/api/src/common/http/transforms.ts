import { onlyDigits } from '../validation/br-documents.js';

/** Funções para `@Transform(...)` do class-transformer. */
type TransformArgs = { value: unknown };

export const trim = ({ value }: TransformArgs): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const upperTrim = ({ value }: TransformArgs): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Texto vazio vira `null` (limpa o campo opcional na edição). */
export const trimToNull = ({ value }: TransformArgs): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** CPF/CNPJ/telefone: guarda só os dígitos. */
export const digits = ({ value }: TransformArgs): unknown => {
  if (typeof value !== 'string') return value;
  const result = onlyDigits(value);
  return result === '' ? null : result;
};

import { z } from 'zod';
import { UFS, isValidCpfOrCnpj, onlyDigits } from '@/lib/br';

/**
 * Peças de schema Zod reaproveitadas pelos formulários de cadastro. Campos opcionais chegam
 * como texto (`''` = vazio) e são convertidos para `null` no `transform` de cada formulário.
 */

export const nameField = z
  .string()
  .trim()
  .min(2, 'Informe pelo menos 2 caracteres.')
  .max(120, 'Informe no máximo 120 caracteres.');

export const optionalText = (max: number) =>
  z.string().trim().max(max, `Informe no máximo ${max} caracteres.`);

export const documentField = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidCpfOrCnpj(value), 'CPF ou CNPJ inválido.');

export const emailField = z
  .string()
  .trim()
  .refine((value) => value === '' || z.email().safeParse(value).success, 'E-mail inválido.');

export const phoneField = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^\d{10,13}$/.test(onlyDigits(value)),
    'Informe DDD e número (10 a 13 dígitos).',
  );

export const ufField = z.enum(UFS).or(z.literal(''));

/** `''` → `null`. */
export const orNull = <T extends string>(value: T | ''): T | null => (value === '' ? null : value);

/** Documento/telefone: só dígitos, ou `null` se vazio. */
export const digitsOrNull = (value: string): string | null =>
  value === '' ? null : onlyDigits(value);

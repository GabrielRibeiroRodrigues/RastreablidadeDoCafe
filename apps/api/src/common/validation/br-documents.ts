import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Unidades federativas do Brasil. */
// prettier-ignore
export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

const allSameDigit = (digits: string): boolean => /^(\d)\1*$/.test(digits);

/** Dígito verificador módulo 11 (regra comum a CPF e CNPJ). */
function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || allSameDigit(cpf)) return false;
  const d1 = checkDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${d1}${d2}`);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || allSameDigit(cnpj)) return false;
  const d1 = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos) com dígitos verificadores válidos. */
export function isValidCpfOrCnpj(value: string): boolean {
  return isValidCpf(value) || isValidCnpj(value);
}

/** Decorator do class-validator. Use junto com `@Transform(digitsOnly)`. */
export function IsCpfOrCnpj(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCpfOrCnpj',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: { message: '$property must be a valid CPF or CNPJ', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidCpfOrCnpj(value),
      },
    });
  };
}

import { onlyDigits } from './br';

/**
 * Máscaras de digitação (aplicadas a cada `onChange`, inclusive em colagens). Formatam o que já
 * foi digitado, sem completar nada: a validação continua nos schemas Zod.
 */

/** CPF até 11 dígitos (`529.982.247-25`); a partir do 12º vira CNPJ (`11.222.333/0001-81`). */
export function maskDocument(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Telefone com DDD: `(11) 3333-4444` (fixo) ou `(11) 98888-7777` (celular). */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  // 10 dígitos: fixo (4+4); 11: celular (5+4).
  const split = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/**
 * Número decimal em pt-BR: só dígitos e uma vírgula (ponto digitado vira vírgula), com até
 * `decimals` casas. `"1250.5"` → `"1250,5"`. Sem separador de milhar (a API não o aceita).
 */
export function maskDecimal(value: string, decimals = 3): string {
  // Com vírgula presente, pontos são separadores de milhar colados ("1.250,5"); sem ela, o ponto
  // é a casa decimal ("1250.5").
  const normalized = value.includes(',') ? value.replace(/\./g, '') : value.replace(/\./g, ',');
  const cleaned = normalized.replace(/[^\d,]/g, '');
  const [int = '', ...rest] = cleaned.split(',');
  if (rest.length === 0) return int;
  if (decimals === 0) return int;
  return `${int},${rest.join('').slice(0, decimals)}`;
}

/** Só dígitos (inteiros: altitude, peneira). */
export const maskInteger = (value: string): string => onlyDigits(value);

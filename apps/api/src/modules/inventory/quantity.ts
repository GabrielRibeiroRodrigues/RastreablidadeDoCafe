import { registerDecorator, type ValidationOptions } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Quantidades de estoque: `numeric(14,3)` no banco, `Decimal` no código e **string** na API
 * ("1250.500") — nunca ponto flutuante.
 */
export type Quantity = Prisma.Decimal;
export const Quantity = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

const QUANTITY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;

/** Formato canônico na API: sempre 3 casas decimais. */
export const formatQuantity = (value: Prisma.Decimal | string | number): string =>
  new Prisma.Decimal(value).toFixed(3);

const UNIT_SHORT: Record<string, string> = { KG: 'kg', BAG_60KG: 'sc', UNIT: 'un' };

const ptBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/**
 * Para pessoas (PDF, e-mail): pt-BR sem zeros à direita e unidade curta —
 * `"15.000", "BAG_60KG"` → `"15 sc"`, `"1250.500", "KG"` → `"1.250,5 kg"`.
 * (`formatQuantity` é o formato da API: "15.000" em pt-BR se leria "quinze mil".)
 */
export function formatQuantityPt(value: Prisma.Decimal | string | number, unit?: string): string {
  // Number é exato para quantidades de estoque (até 11 dígitos inteiros + 3 casas).
  const text = ptBr.format(new Prisma.Decimal(value).toNumber());
  return unit ? `${text} ${UNIT_SHORT[unit] ?? unit}` : text;
}

/** String decimal positiva com até 3 casas (ex.: "60", "1250.5", "0.250"). */
export function IsQuantity(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isQuantity',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: {
        message: '$property must be a positive decimal string with up to 3 decimal places',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          QUANTITY_PATTERN.test(value) &&
          new Prisma.Decimal(value).greaterThan(0),
      },
    });
  };
}

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

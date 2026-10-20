import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Folga para relógios de computador ou celular levemente adiantados. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Data de um fato já ocorrido (recebimento, movimentação, produção, expedição): não pode estar no
 * futuro. Lançar algo "para amanhã" faria o histórico por data mostrar saldo que ainda não existe.
 * Use junto de `@IsDateString()` (este validador ignora valores que não são datas).
 */
export function IsNotFuture(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isNotFuture',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: { message: '$property cannot be in the future', ...options },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return true;
          const time = Date.parse(value);
          return Number.isNaN(time) || time <= Date.now() + FUTURE_TOLERANCE_MS;
        },
      },
    });
  };
}

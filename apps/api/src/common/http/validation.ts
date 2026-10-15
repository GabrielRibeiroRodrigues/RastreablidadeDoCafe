import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;
  messages: string[];
}

/** Erro de validação que o filtro converte em problem+json com a lista `errors`. */
export class ValidationProblemException extends BadRequestException {
  constructor(readonly errors: FieldError[]) {
    super('Request validation failed');
  }
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationProblemException(flattenValidationErrors(errors)),
  });
}

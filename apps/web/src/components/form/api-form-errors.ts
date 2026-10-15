import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, getErrorMessage, translateFieldMessage } from '@/lib/api';

/** Chave do erro geral do formulário (exibido por `<FormRootError>`). */
export const ROOT_SERVER_ERROR = 'root.server';

/**
 * Leva o erro da API para o formulário: cada `errors[].field` conhecido vira erro do campo
 * (`varieties.0` cai em `varieties`); o restante — status sem campos, campos desconhecidos,
 * rede — vira o erro geral do formulário. O primeiro campo com erro recebe o foco.
 */
export function applyApiErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  fields: readonly Path<T>[],
): void {
  if (!(error instanceof ApiError)) {
    setError(ROOT_SERVER_ERROR, { type: 'server', message: getErrorMessage(error) });
    return;
  }

  const known = new Set<string>(fields);
  const unmatched: string[] = [];
  let mapped = 0;

  for (const fieldError of error.errors) {
    const message = fieldError.messages.map(translateFieldMessage).join(' ');
    const field = fieldError.field.split('.')[0] ?? fieldError.field;
    if (known.has(field)) {
      setError(field as Path<T>, { type: 'server', message }, { shouldFocus: mapped === 0 });
      mapped += 1;
    } else {
      unmatched.push(`${fieldError.field}: ${message}`);
    }
  }

  if (mapped === 0 || unmatched.length > 0) {
    setError(ROOT_SERVER_ERROR, {
      type: String(error.status),
      message: [getErrorMessage(error), ...unmatched].join(' '),
    });
  }
}

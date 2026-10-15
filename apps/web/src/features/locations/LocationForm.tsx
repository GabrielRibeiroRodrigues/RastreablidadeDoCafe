import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { EntityFormProps } from '@/components/catalog/types';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, SelectField, TextareaField, TextField } from '@/components/form/fields';
import { nameField, optionalText, orNull } from '@/components/form/schemas';
import { FieldGroup } from '@/components/ui/field';
import { toOptions } from '@/lib/options';
import { LOCATION_TYPE_LABELS, LOCATION_TYPES, type Location, type LocationInput } from './api';

const schema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Use até 20 caracteres: letras, números e hífen.'),
    name: nameField,
    type: z.enum(LOCATION_TYPES, 'Selecione o tipo.'),
    description: optionalText(500),
  })
  .transform((values): LocationInput => ({ ...values, description: orNull(values.description) }));

type FormValues = z.input<typeof schema>;

const FIELDS = ['code', 'name', 'type', 'description'] as const;

function toFormValues(location: Location | null): FormValues {
  return {
    code: location?.code ?? '',
    name: location?.name ?? '',
    type: location?.type ?? 'WAREHOUSE',
    description: location?.description ?? '',
  };
}

export function LocationForm({
  entity,
  formId,
  onSubmit,
}: EntityFormProps<Location, LocationInput>) {
  const form = useForm<FormValues, unknown, LocationInput>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(entity),
  });

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit(input);
    } catch (error) {
      applyApiErrors(form.setError, error, FIELDS);
    }
  });

  return (
    <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
      <FormRootError errors={form.formState.errors} />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="code"
          label="Código"
          required
          autoComplete="off"
          placeholder="ARM-01"
          inputClassName="uppercase placeholder:normal-case"
          description="Código curto e único: letras, números e hífen."
        />
        <SelectField
          control={form.control}
          name="type"
          label="Tipo"
          required
          options={toOptions(LOCATION_TYPE_LABELS)}
        />
        <TextField
          control={form.control}
          name="name"
          label="Nome"
          required
          placeholder="Armazém de café verde"
          className="sm:col-span-2"
        />
        <TextareaField
          control={form.control}
          name="description"
          label="Descrição"
          placeholder="Capacidade, condições de armazenagem, observações…"
          rows={3}
          className="sm:col-span-2"
        />
      </FieldGroup>
    </form>
  );
}

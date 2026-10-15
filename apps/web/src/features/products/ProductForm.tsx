import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { EntityFormProps } from '@/components/catalog/types';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, SelectField, TextareaField, TextField } from '@/components/form/fields';
import { FieldGroup } from '@/components/ui/field';
import { toOptions } from '@/lib/options';
import type { Product, ProductInput } from './api';
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  ROAST_LEVEL_LABELS,
  ROAST_LEVELS,
  ROASTABLE_TYPES,
  UNIT_LABELS,
  UNITS,
} from './labels';

const schema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'Use de 2 a 40 caracteres: letras, números e hífen.'),
    name: z
      .string()
      .trim()
      .min(2, 'Informe pelo menos 2 caracteres.')
      .max(120, 'Informe no máximo 120 caracteres.'),
    type: z.enum(PRODUCT_TYPES, 'Selecione o tipo.'),
    unit: z.enum(UNITS, 'Selecione a unidade.'),
    defaultRoastLevel: z.enum(ROAST_LEVELS).or(z.literal('')),
    description: z.string().trim().max(500, 'Informe no máximo 500 caracteres.'),
  })
  .transform((values): ProductInput => ({
    ...values,
    // Grau de torra só vale para torrados e blends; nos demais é limpo.
    defaultRoastLevel:
      ROASTABLE_TYPES.includes(values.type) && values.defaultRoastLevel
        ? values.defaultRoastLevel
        : null,
    description: values.description || null,
  }));

type FormValues = z.input<typeof schema>;

const FIELDS = ['sku', 'name', 'type', 'unit', 'defaultRoastLevel', 'description'] as const;

function toFormValues(product: Product | null): FormValues {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    type: product?.type ?? 'GREEN',
    unit: product?.unit ?? 'KG',
    defaultRoastLevel: product?.defaultRoastLevel ?? '',
    description: product?.description ?? '',
  };
}

export function ProductForm({ entity, formId, onSubmit }: EntityFormProps<Product, ProductInput>) {
  const form = useForm<FormValues, unknown, ProductInput>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(entity),
  });
  const type = useWatch({ control: form.control, name: 'type' });
  const roastable = ROASTABLE_TYPES.includes(type);

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
          name="sku"
          label="SKU"
          required
          autoComplete="off"
          placeholder="VRD-BOURBON-AM"
          inputClassName="uppercase placeholder:normal-case"
          description="Código interno único: letras, números e hífen."
        />
        <TextField
          control={form.control}
          name="name"
          label="Nome"
          required
          placeholder="Café verde Bourbon Amarelo"
        />
        <SelectField
          control={form.control}
          name="type"
          label="Tipo"
          required
          options={toOptions(PRODUCT_TYPE_LABELS)}
        />
        <SelectField
          control={form.control}
          name="unit"
          label="Unidade"
          required
          options={toOptions(UNIT_LABELS)}
        />
        {roastable && (
          <SelectField
            control={form.control}
            name="defaultRoastLevel"
            label="Grau de torra padrão"
            options={toOptions(ROAST_LEVEL_LABELS)}
            noneLabel="Não definido"
            placeholder="Não definido"
            className="sm:col-span-2"
          />
        )}
        <TextareaField
          control={form.control}
          name="description"
          label="Descrição"
          placeholder="Notas sensoriais, origem, observações…"
          rows={3}
          className="sm:col-span-2"
        />
      </FieldGroup>
    </form>
  );
}

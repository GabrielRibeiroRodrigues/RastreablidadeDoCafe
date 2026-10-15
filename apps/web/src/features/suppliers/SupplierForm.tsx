import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { EntityFormProps } from '@/components/catalog/types';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, SelectField, TagsField, TextField } from '@/components/form/fields';
import {
  digitsOrNull,
  documentField,
  emailField,
  nameField,
  optionalText,
  orNull,
  phoneField,
  ufField,
} from '@/components/form/schemas';
import { FieldGroup } from '@/components/ui/field';
import { formatDocument, formatPhone, UFS } from '@/lib/br';
import { toOptions } from '@/lib/options';
import { SUPPLIER_TYPE_LABELS, SUPPLIER_TYPES, type Supplier, type SupplierInput } from './api';

const MAX_VARIETIES = 20;

const schema = z
  .object({
    name: nameField,
    type: z.enum(SUPPLIER_TYPES, 'Selecione o tipo.'),
    document: documentField,
    farmName: optionalText(120),
    region: optionalText(80),
    city: optionalText(80),
    state: ufField,
    altitudeMeters: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || (/^\d+$/.test(value) && Number(value) <= 3000),
        'Informe um número inteiro entre 0 e 3000.',
      ),
    varieties: z
      .array(z.string().max(60, 'Cada variedade pode ter até 60 caracteres.'))
      .max(MAX_VARIETIES, `Informe no máximo ${MAX_VARIETIES} variedades.`),
    email: emailField,
    phone: phoneField,
  })
  .transform((values): SupplierInput => ({
    name: values.name,
    type: values.type,
    document: digitsOrNull(values.document),
    farmName: orNull(values.farmName),
    region: orNull(values.region),
    city: orNull(values.city),
    state: orNull(values.state),
    altitudeMeters: values.altitudeMeters === '' ? null : Number(values.altitudeMeters),
    varieties: values.varieties,
    email: orNull(values.email),
    phone: digitsOrNull(values.phone),
  }));

type FormValues = z.input<typeof schema>;

const FIELDS = [
  'name',
  'type',
  'document',
  'farmName',
  'region',
  'city',
  'state',
  'altitudeMeters',
  'varieties',
  'email',
  'phone',
] as const;

function toFormValues(supplier: Supplier | null): FormValues {
  return {
    name: supplier?.name ?? '',
    type: supplier?.type ?? 'PRODUCER',
    document: formatDocument(supplier?.document),
    farmName: supplier?.farmName ?? '',
    region: supplier?.region ?? '',
    city: supplier?.city ?? '',
    state: (supplier?.state as FormValues['state'] | null) ?? '',
    altitudeMeters: supplier?.altitudeMeters?.toString() ?? '',
    varieties: supplier?.varieties ?? [],
    email: supplier?.email ?? '',
    phone: formatPhone(supplier?.phone),
  };
}

const UF_OPTIONS = UFS.map((uf) => ({ value: uf, label: uf }));

export function SupplierForm({
  entity,
  formId,
  onSubmit,
}: EntityFormProps<Supplier, SupplierInput>) {
  const form = useForm<FormValues, unknown, SupplierInput>({
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
          name="name"
          label="Nome"
          required
          placeholder="José Aparecido da Silva"
          className="sm:col-span-2"
        />
        <SelectField
          control={form.control}
          name="type"
          label="Tipo"
          required
          options={toOptions(SUPPLIER_TYPE_LABELS)}
        />
        <TextField
          control={form.control}
          name="document"
          label="CPF ou CNPJ"
          inputMode="numeric"
          placeholder="Com ou sem pontuação"
        />
        <TextField
          control={form.control}
          name="farmName"
          label="Fazenda"
          placeholder="Sítio Santa Inês"
        />
        <TextField
          control={form.control}
          name="region"
          label="Região"
          placeholder="Mantiqueira de Minas"
        />
        <TextField control={form.control} name="city" label="Cidade" placeholder="Carmo de Minas" />
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            control={form.control}
            name="state"
            label="UF"
            options={UF_OPTIONS}
            noneLabel="—"
            placeholder="—"
          />
          <TextField
            control={form.control}
            name="altitudeMeters"
            label="Altitude (m)"
            inputMode="numeric"
            placeholder="1250"
          />
        </div>
        <TagsField
          control={form.control}
          name="varieties"
          label="Variedades"
          placeholder="Digite e pressione Enter"
          description="Ex.: Bourbon Amarelo, Catuaí Vermelho."
          maxTags={MAX_VARIETIES}
          className="sm:col-span-2"
        />
        <TextField
          control={form.control}
          name="email"
          label="E-mail"
          type="email"
          autoComplete="off"
          placeholder="contato@fazenda.com.br"
        />
        <TextField
          control={form.control}
          name="phone"
          label="Telefone"
          type="tel"
          placeholder="(35) 99999-0000"
        />
      </FieldGroup>
    </form>
  );
}

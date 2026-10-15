import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { EntityFormProps } from '@/components/catalog/types';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, SelectField, TextField } from '@/components/form/fields';
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
import type { Customer, CustomerInput } from './api';
import { maskDocument, maskPhone } from '@/lib/masks';

const schema = z
  .object({
    name: nameField,
    document: documentField,
    email: emailField,
    phone: phoneField,
    city: optionalText(80),
    state: ufField,
  })
  .transform((values): CustomerInput => ({
    name: values.name,
    document: digitsOrNull(values.document),
    email: orNull(values.email),
    phone: digitsOrNull(values.phone),
    city: orNull(values.city),
    state: orNull(values.state),
  }));

type FormValues = z.input<typeof schema>;

const FIELDS = ['name', 'document', 'email', 'phone', 'city', 'state'] as const;

function toFormValues(customer: Customer | null): FormValues {
  return {
    name: customer?.name ?? '',
    document: formatDocument(customer?.document),
    email: customer?.email ?? '',
    phone: formatPhone(customer?.phone),
    city: customer?.city ?? '',
    state: (customer?.state as FormValues['state'] | null) ?? '',
  };
}

const UF_OPTIONS = UFS.map((uf) => ({ value: uf, label: uf }));

export function CustomerForm({
  entity,
  formId,
  onSubmit,
}: EntityFormProps<Customer, CustomerInput>) {
  const form = useForm<FormValues, unknown, CustomerInput>({
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
          placeholder="Cafeteria Grão Fino"
          className="sm:col-span-2"
        />
        <TextField
          control={form.control}
          name="document"
          label="CPF ou CNPJ"
          inputMode="numeric"
          mask={maskDocument}
          placeholder="000.000.000-00"
        />
        <TextField
          control={form.control}
          name="phone"
          label="Telefone"
          type="tel"
          inputMode="tel"
          mask={maskPhone}
          placeholder="(11) 98888-7777"
        />
        <TextField
          control={form.control}
          name="email"
          label="E-mail"
          type="email"
          autoComplete="off"
          placeholder="compras@cliente.com.br"
          className="sm:col-span-2"
        />
        <TextField control={form.control} name="city" label="Cidade" placeholder="São Paulo" />
        <SelectField
          control={form.control}
          name="state"
          label="UF"
          options={UF_OPTIONS}
          noneLabel="—"
          placeholder="—"
        />
      </FieldGroup>
    </form>
  );
}

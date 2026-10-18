import { zodResolver } from '@hookform/resolvers/zod';
import { ROLES } from '@traceflow/shared';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ROLE_LABELS } from '@/auth/roles';
import type { EntityFormProps } from '@/components/catalog/types';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, SelectField, TextField } from '@/components/form/fields';
import { nameField } from '@/components/form/schemas';
import { FieldGroup } from '@/components/ui/field';
import type { User, UserInput } from './api';

const ROLE_DESCRIPTIONS = {
  admin: 'Tudo, inclusive usuários, ajustes, estornos, recall e importação.',
  operator: 'Recebe, movimenta, produz e expede. Abre não conformidades.',
  auditor: 'Somente leitura, com acesso à trilha de auditoria.',
} as const;

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')),
  name: nameField,
  role: z.enum(ROLES, 'Escolha um perfil.'),
});

type FormValues = z.input<typeof schema>;

const FIELDS = ['email', 'name', 'role'] as const;
const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export function UserForm({ entity, formId, onSubmit }: EntityFormProps<User, UserInput>) {
  const form = useForm<FormValues, unknown, UserInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: entity?.email ?? '',
      name: entity?.name ?? '',
      role: entity?.role ?? 'operator',
    },
  });
  const role = useWatch({ control: form.control, name: 'role' });

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
      <FieldGroup className="grid gap-4">
        <TextField
          control={form.control}
          name="email"
          label="E-mail"
          type="email"
          autoComplete="off"
          required
          disabled={entity !== null}
          placeholder="nome@empresa.com.br"
          description={
            entity
              ? 'O e-mail de login não muda depois do convite.'
              : 'Em produção, o convite com uma senha temporária chega neste e-mail.'
          }
        />
        <TextField
          control={form.control}
          name="name"
          label="Nome"
          required
          placeholder="Bruno Costa"
        />
        <SelectField
          control={form.control}
          name="role"
          label="Perfil"
          required
          options={ROLE_OPTIONS}
          description={role ? ROLE_DESCRIPTIONS[role] : undefined}
        />
      </FieldGroup>
    </form>
  );
}

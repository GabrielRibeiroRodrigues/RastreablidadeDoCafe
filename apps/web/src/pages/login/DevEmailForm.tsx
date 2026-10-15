import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const schema = z.object({
  email: z.email('Informe um e-mail válido.'),
});

type FormValues = z.infer<typeof schema>;

/** Alternativa à lista: entrar com qualquer e-mail existente no seed da API. */
export function DevEmailForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (email: string) => void;
  disabled: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(({ email }) => onSubmit(email))(event)}
      className="flex items-start gap-2"
    >
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="flex-1">
            <FieldLabel htmlFor="dev-email" className="sr-only">
              E-mail
            </FieldLabel>
            <Input
              {...field}
              id="dev-email"
              type="email"
              autoComplete="email"
              placeholder="outro.usuario@empresa.com.br"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Button type="submit" variant="outline" disabled={disabled}>
        Entrar
      </Button>
    </form>
  );
}

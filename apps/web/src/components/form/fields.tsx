import { CircleAlertIcon } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import {
  Controller,
  type Control,
  type ControllerFieldState,
  type FieldErrors,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from './TagInput';

/**
 * Campos de formulário (React Hook Form + componentes do shadcn) com rótulo, descrição e erro.
 * Os valores do formulário são texto; a conversão para o DTO fica no schema Zod de cada tela.
 */

interface BaseFieldProps<T extends FieldValues, C, O extends FieldValues> {
  control: Control<T, C, O>;
  name: Path<T>;
  label: string;
  description?: ReactNode;
  required?: boolean;
  className?: string;
}

function FieldShell({
  id,
  label,
  required,
  description,
  fieldState,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  description?: ReactNode;
  fieldState: ControllerFieldState;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={fieldState.invalid} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </FieldLabel>
      {children}
      {description && !fieldState.invalid && <FieldDescription>{description}</FieldDescription>}
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  );
}

export function TextField<T extends FieldValues, C, O extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  inputClassName,
  ...inputProps
}: BaseFieldProps<T, C, O> & { inputClassName?: string } & Omit<
    ComponentProps<typeof Input>,
    'name' | 'value' | 'onChange' | 'onBlur' | 'ref' | 'className'
  >) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell {...{ id, label, required, description, fieldState, className }}>
          <Input
            {...inputProps}
            {...field}
            value={field.value ?? ''}
            id={id}
            className={inputClassName}
            aria-invalid={fieldState.invalid}
            aria-required={required}
          />
        </FieldShell>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues, C, O extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  ...textareaProps
}: BaseFieldProps<T, C, O> &
  Omit<ComponentProps<typeof Textarea>, 'name' | 'value' | 'onChange' | 'onBlur' | 'ref'>) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell {...{ id, label, required, description, fieldState, className }}>
          <Textarea
            {...textareaProps}
            {...field}
            value={field.value ?? ''}
            id={id}
            aria-invalid={fieldState.invalid}
          />
        </FieldShell>
      )}
    />
  );
}

/** O Radix Select não aceita `""`; este valor representa "nenhum" em campos opcionais. */
const NONE = '__none__';

export function SelectField<T extends FieldValues, C, O extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  options,
  placeholder = 'Selecione',
  noneLabel,
}: BaseFieldProps<T, C, O> & {
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  /** Quando informado, o campo é opcional e ganha uma opção para limpar (valor `""`). */
  noneLabel?: string;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const value = (field.value as string | undefined) ?? '';
        return (
          <FieldShell {...{ id, label, required, description, fieldState, className }}>
            <Select
              name={field.name}
              value={value === '' ? (noneLabel ? NONE : '') : value}
              onValueChange={(next) => field.onChange(next === NONE ? '' : next)}
            >
              <SelectTrigger
                id={id}
                ref={field.ref}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
                className="w-full"
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        );
      }}
    />
  );
}

export function TagsField<T extends FieldValues, C, O extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  placeholder,
  maxTags,
}: BaseFieldProps<T, C, O> & { placeholder?: string; maxTags?: number }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell {...{ id, label, required, description, fieldState, className }}>
          <TagInput
            id={id}
            value={(field.value as string[] | undefined) ?? []}
            onChange={field.onChange}
            onBlur={field.onBlur}
            invalid={fieldState.invalid}
            {...(placeholder !== undefined && { placeholder })}
            {...(maxTags !== undefined && { maxTags })}
          />
        </FieldShell>
      )}
    />
  );
}

/** Erro geral do formulário (403, 409 sem campo, rede...). */
export function FormRootError<T extends FieldValues>({ errors }: { errors: FieldErrors<T> }) {
  const message = errors.root?.server?.message;
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

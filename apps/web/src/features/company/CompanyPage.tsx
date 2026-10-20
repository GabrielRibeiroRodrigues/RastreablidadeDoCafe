import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchema } from '@traceflow/shared';
import { ExternalLinkIcon, SaveIcon } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, TextField } from '@/components/form/fields';
import { nameField } from '@/components/form/schemas';
import { ErrorState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageSkeleton } from '@/components/layout/PageSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiClient, unwrap } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api';
import { isDarkColor } from '@/lib/color';

type Company = ApiSchema<'CompanyResponse'>;

const DEFAULT_COLOR = '#2b211b';
const HEX = /^#[0-9a-fA-F]{6}$/;

const schema = z.object({
  name: nameField,
  brandColor: z
    .string()
    .trim()
    .refine((value) => value === '' || HEX.test(value), 'Use o formato #RRGGBB.'),
  tagline: z.string().trim().max(140, 'Informe no máximo 140 caracteres.'),
  website: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(value),
      'Informe um endereço https://',
    ),
});
type FormValues = z.infer<typeof schema>;
const FIELDS = ['name', 'brandColor', 'tagline', 'website'] as const;

const orNull = (value: string) => (value === '' ? null : value);

/** Pré-visualização do topo da página pública (mesma regra de contraste da página real). */
function BrandPreview({ values, companyName }: { values: FormValues; companyName: string }) {
  const color = HEX.test(values.brandColor) ? values.brandColor : null;
  const background = isDarkColor(color) ? color : null;
  const stripe = color && !background ? color : null;
  return (
    <div
      className="overflow-hidden rounded-xl bg-sidebar text-sidebar-foreground"
      style={background ? { backgroundColor: background } : undefined}
      aria-label="Pré-visualização da página pública"
    >
      {stripe && <div aria-hidden className="h-1.5" style={{ backgroundColor: stripe }} />}
      <div className="space-y-1 p-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-sidebar-primary uppercase">
          {values.name || companyName}
        </p>
        {values.tagline && <p className="text-sm text-sidebar-foreground/80">{values.tagline}</p>}
        {values.website && (
          <p className="inline-flex items-center gap-1 text-xs text-sidebar-foreground/80">
            {values.website.replace(/^https:\/\//, '')}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </p>
        )}
        <p className="pt-3 text-2xl font-semibold tracking-tight text-sidebar-accent-foreground">
          Blend da Casa
        </p>
      </div>
      {color && !background && (
        <p className="border-t border-sidebar-border px-5 py-2 text-xs text-sidebar-foreground/70">
          Cor clara: aparece como faixa no topo para o texto continuar legível.
        </p>
      )}
    </div>
  );
}

function CompanyForm({ company }: { company: Company }) {
  const client = useQueryClient();
  const colorId = useId();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: company.name,
      brandColor: company.brandColor ?? '',
      tagline: company.tagline ?? '',
      website: company.website ?? '',
    },
  });
  const values = useWatch({ control: form.control }) as FormValues;

  const save = useMutation({
    mutationFn: (input: FormValues) =>
      unwrap(
        getApiClient().PATCH('/v1/companies/me', {
          body: {
            name: input.name,
            brandColor: orNull(input.brandColor),
            tagline: orNull(input.tagline),
            website: orNull(input.website),
          },
        }),
      ),
    onSuccess: (updated) => {
      client.setQueryData(['company'], updated);
      void client.invalidateQueries({ queryKey: ['me'] });
      form.reset({
        name: updated.name,
        brandColor: updated.brandColor ?? '',
        tagline: updated.tagline ?? '',
        website: updated.website ?? '',
      });
      toast.success('Dados da empresa salvos');
    },
  });

  const submit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync(input);
    } catch (error) {
      applyApiErrors(form.setError, error, FIELDS);
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Identidade</CardTitle>
          <CardDescription>
            Aparece na página pública do QR code e na faixa das etiquetas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormRootError errors={form.formState.errors} />
          <FieldGroup className="grid gap-4">
            <TextField control={form.control} name="name" label="Nome da empresa" required />
            <Controller
              control={form.control}
              name="brandColor"
              render={({ field, fieldState }) => (
                <div className="space-y-2">
                  <Label htmlFor={colorId}>Cor da marca</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Escolher cor da marca"
                      value={HEX.test(field.value) ? field.value : DEFAULT_COLOR}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                    />
                    <Input
                      id={colorId}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder="#2b211b"
                      maxLength={7}
                      className="max-w-36 font-mono"
                      aria-invalid={fieldState.invalid}
                    />
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange('')}
                      >
                        Usar padrão
                      </Button>
                    )}
                  </div>
                  {fieldState.error && (
                    <p className="text-sm text-destructive">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
            <TextField
              control={form.control}
              name="tagline"
              label="Frase curta"
              placeholder="Cafés especiais da Mantiqueira"
              maxLength={140}
            />
            <TextField
              control={form.control}
              name="website"
              label="Site"
              type="url"
              placeholder="https://suaempresa.com.br"
            />
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
              <SaveIcon />
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2 lg:col-span-2">
        <p className="text-sm font-medium">Pré-visualização</p>
        <BrandPreview values={values} companyName={company.name} />
      </div>
    </form>
  );
}

/** Dados e identidade da empresa (só admin). */
export function CompanyPage() {
  const query = useQuery({
    queryKey: ['company'],
    queryFn: ({ signal }) => unwrap(getApiClient().GET('/v1/companies/me', { signal })),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresa"
        description="Nome e identidade visual usados na página pública e nas etiquetas."
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Empresa' }]}
      />
      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <CompanyForm company={query.data} />
      )}
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeftIcon, InfoIcon, Loader2Icon, PackagePlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useInventoryPermissions } from '@/auth/permissions';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { FormRootError, SelectField, TextField } from '@/components/form/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { LOCATION_TYPE_LABELS } from '@/features/locations/api';
import { PRODUCT_TYPE_LABELS } from '@/features/products/labels';
import { getErrorMessage } from '@/lib/api';
import { getApiClient, unwrap } from '@/lib/api-client';
import { UNIT_SHORT, parseQuantityInput, toDateTimeLocal } from '@/lib/quantity';
import type { ApiSchema } from '@traceflow/shared';
import { inventoryApi, type ReceiptInput } from './api';
import { PageHeader } from './components';
import { useIdempotencyKey, useInvalidateInventory, useLocations } from './hooks';
import { QUALITY_FIELDS, qualityShape, toQualityDto } from './quality';
import { QualityFields } from './QualityFields';

type Product = ApiSchema<'ProductResponse'>;
type Supplier = ApiSchema<'SupplierResponse'>;

const schema = z.object({
  productId: z.string().min(1, 'Selecione o produto.'),
  supplierId: z.string(),
  locationId: z.string().min(1, 'Selecione o local.'),
  quantity: z
    .string()
    .refine(
      (v) => parseQuantityInput(v) !== null,
      'Informe uma quantidade positiva (até 3 casas decimais).',
    ),
  receivedAt: z.string().min(1, 'Informe a data do recebimento.'),
  documentRef: z.string().trim().max(60, 'Informe no máximo 60 caracteres.'),
  ...qualityShape,
});

type FormValues = z.infer<typeof schema>;

const FIELDS = [
  'productId',
  'supplierId',
  'locationId',
  'quantity',
  'receivedAt',
  'documentRef',
  ...QUALITY_FIELDS,
] as const;

function toDto(values: FormValues): ReceiptInput {
  return {
    productId: values.productId,
    supplierId: values.supplierId || null,
    locationId: values.locationId,
    quantity: parseQuantityInput(values.quantity) ?? values.quantity,
    receivedAt: new Date(values.receivedAt).toISOString(),
    documentRef: values.documentRef || null,
    ...toQualityDto(values),
  };
}

const searchProducts = (q: string, signal: AbortSignal) =>
  unwrap(
    getApiClient().GET('/v1/products', {
      params: { query: { status: 'active', pageSize: 20, sort: 'name', ...(q && { q }) } },
      signal,
    }),
  ).then((page) => page.data);

const searchSuppliers = (q: string, signal: AbortSignal) =>
  unwrap(
    getApiClient().GET('/v1/suppliers', {
      params: { query: { status: 'active', pageSize: 20, sort: 'name', ...(q && { q }) } },
      signal,
    }),
  ).then((page) => page.data);

/** Recebimento de café: cria o lote (código automático) e a entrada no estoque. */
export function ReceiptPage() {
  const { canOperate } = useInventoryPermissions();
  const navigate = useNavigate();
  const formId = useId();
  const productFieldId = useId();
  const supplierFieldId = useId();
  const invalidate = useInvalidateInventory();
  const idempotency = useIdempotencyKey();
  const locations = useLocations();
  const [product, setProduct] = useState<Product | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: '',
      supplierId: '',
      locationId: '',
      quantity: '',
      receivedAt: toDateTimeLocal(new Date()),
      documentRef: '',
      expiresAt: '',
      harvest: '',
      variety: '',
      altitudeMeters: '',
      screenSize: '',
      moisturePercent: '',
      roastLevel: '',
      cuppingScore: '',
      notes: '',
    },
  });

  const locationId = useWatch({ control: form.control, name: 'locationId' });
  const selectedLocation = locations.data?.data.find((l) => l.id === locationId);

  const receive = useMutation({
    mutationFn: (body: ReceiptInput) => inventoryApi.receive(body, idempotency.keyFor(body)),
    onSuccess: async (lot) => {
      idempotency.reset();
      toast.success(`Lote ${lot.code} recebido`, {
        description:
          lot.status === 'QUARANTINE' ? 'O lote entrou em quarentena.' : lot.product.name,
      });
      await invalidate();
      void navigate(`/lotes/${lot.id}`);
    },
    onError: (error) =>
      toast.error('Não foi possível registrar o recebimento', {
        description: getErrorMessage(error),
      }),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await receive.mutateAsync(toDto(values));
    } catch (error) {
      applyApiErrors(form.setError, error, FIELDS);
    }
  });

  if (!canOperate) {
    return (
      <div className="space-y-6">
        <PageHeader title="Novo recebimento" />
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Seu perfil é somente leitura: o recebimento é feito por administradores e operadores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const unit = product ? UNIT_SHORT[product.unit] : null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="/lotes">
          <ArrowLeftIcon />
          Lotes
        </Link>
      </Button>
      <PageHeader
        title="Novo recebimento"
        description="Entrada de café de um fornecedor. O lote recebe um código automático (CAF-AAAA-NNNNNN) e o saldo entra no local escolhido."
      />

      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="space-y-6">
        <FormRootError errors={form.formState.errors} />

        <Card>
          <CardHeader>
            <CardTitle>Recebimento</CardTitle>
            <CardDescription>Campos com * são obrigatórios.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="productId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={productFieldId}>
                    Produto<span className="text-destructive">*</span>
                  </FieldLabel>
                  <EntityCombobox<Product>
                    id={productFieldId}
                    queryKey="products"
                    search={searchProducts}
                    value={product}
                    onChange={(next) => {
                      setProduct(next);
                      field.onChange(next?.id ?? '');
                    }}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="Buscar por nome ou SKU"
                    getLabel={(p) => `${p.name} (${p.sku})`}
                    renderOption={(p) => (
                      <div>
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku} · {PRODUCT_TYPE_LABELS[p.type]} · {UNIT_SHORT[p.unit]}
                        </div>
                      </div>
                    )}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="supplierId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={supplierFieldId}>Fornecedor</FieldLabel>
                  <EntityCombobox<Supplier>
                    id={supplierFieldId}
                    queryKey="suppliers"
                    search={searchSuppliers}
                    value={supplier}
                    clearable
                    onChange={(next) => {
                      setSupplier(next);
                      field.onChange(next?.id ?? '');
                    }}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="Buscar por nome ou fazenda (opcional)"
                    getLabel={(s) => (s.farmName ? `${s.name} · ${s.farmName}` : s.name)}
                    renderOption={(s) => (
                      <div>
                        <div className="truncate font-medium">{s.name}</div>
                        {s.farmName && (
                          <div className="text-xs text-muted-foreground">{s.farmName}</div>
                        )}
                      </div>
                    )}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <SelectField
              control={form.control}
              name="locationId"
              label="Local de destino"
              required
              placeholder={locations.isPending ? 'Carregando…' : 'Selecione'}
              options={(locations.data?.data ?? []).map((l) => ({
                value: l.id,
                label: `${l.code} · ${l.name} (${LOCATION_TYPE_LABELS[l.type]})`,
              }))}
              description={
                selectedLocation?.type === 'QUARANTINE'
                  ? 'Local de quarentena: o lote será criado em quarentena.'
                  : 'Escolher um local de quarentena cria o lote já em quarentena.'
              }
            />
            <TextField
              control={form.control}
              name="quantity"
              label={unit ? `Quantidade (${unit})` : 'Quantidade'}
              required
              inputMode="decimal"
              placeholder="60"
              description={
                product
                  ? `Na unidade do produto: ${unit}. Use vírgula para decimais.`
                  : 'Selecione o produto para ver a unidade.'
              }
            />
            <TextField
              control={form.control}
              name="receivedAt"
              label="Recebido em"
              required
              type="datetime-local"
            />
            <TextField
              control={form.control}
              name="documentRef"
              label="Nota fiscal / documento"
              placeholder="NF 004512"
            />
            <TextField control={form.control} name="expiresAt" label="Validade" type="date" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qualidade</CardTitle>
            <CardDescription>
              Dados da classificação do café. Todos opcionais; podem ser corrigidos depois.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QualityFields control={form.control} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/lotes">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={receive.isPending}>
            {receive.isPending ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <PackagePlusIcon />
            )}
            Registrar recebimento
          </Button>
        </div>
      </form>
    </div>
  );
}

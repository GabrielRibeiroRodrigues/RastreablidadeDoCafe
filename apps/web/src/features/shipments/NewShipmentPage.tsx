import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  TruckIcon,
} from 'lucide-react';
import { useId, useMemo } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useInventoryPermissions } from '@/auth/permissions';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { FormRootError, TextareaField, TextField } from '@/components/form/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Customer } from '@/features/customers/api';
import { PageHeader } from '@/features/inventory/components';
import { useIdempotencyKey, useInvalidateInventory } from '@/features/inventory/hooks';
import { StockLotPicker } from '@/features/inventory/StockLotPicker';
import type { StockOption } from '@/features/inventory/stock-options';
import { ProductTypeBadge } from '@/features/production/components';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatDocument } from '@/lib/br';
import {
  UNIT_SHORT,
  formatQuantity,
  parseQuantityInput,
  toDateTimeLocal,
  toMilli,
} from '@/lib/quantity';
import { searchActiveCustomers, shipmentsApi, type ShipmentInput } from './api';

const QUANTITY_HINT = 'Informe uma quantidade positiva (até 3 casas decimais).';

const schema = z
  .object({
    customer: z.custom<Customer>().nullable(),
    orderRef: z.string().trim().max(60, 'Informe no máximo 60 caracteres.'),
    shippedAt: z.string().min(1, 'Informe a data da expedição.'),
    items: z.array(z.object({ row: z.custom<StockOption>().nullable(), quantity: z.string() })),
    notes: z.string().trim().max(2000, 'Informe no máximo 2000 caracteres.'),
  })
  .superRefine((values, ctx) => {
    if (!values.customer) {
      ctx.addIssue({ code: 'custom', path: ['customer'], message: 'Selecione o cliente.' });
    }
    if (values.items.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Adicione ao menos um item.' });
    }
    values.items.forEach((item, index) => {
      if (!item.row) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'row'],
          message: 'Selecione o lote.',
        });
        return;
      }
      const quantity = parseQuantityInput(item.quantity);
      if (quantity === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'quantity'],
          message: QUANTITY_HINT,
        });
      } else if (toMilli(quantity) > toMilli(item.row.quantity)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'quantity'],
          message: `Disponível: ${formatQuantity(item.row.quantity, item.row.unit)}`,
        });
      }
    });
  });

type FormValues = z.infer<typeof schema>;

const FIELDS = ['orderRef', 'shippedAt', 'notes'] as const;

const emptyItem = (): FormValues['items'][number] => ({ row: null, quantity: '' });

function toDto(values: FormValues): ShipmentInput {
  return {
    customerId: values.customer?.id ?? '',
    orderRef: values.orderRef || null,
    shippedAt: new Date(values.shippedAt).toISOString(),
    notes: values.notes || null,
    items: values.items.map((item) => ({
      lotId: item.row?.lot.id ?? '',
      locationId: item.row?.location.id ?? '',
      quantity: parseQuantityInput(item.quantity) ?? item.quantity,
    })),
  };
}

/** Nova expedição: cliente, itens (lote × local) e quantidades. Envia `Idempotency-Key`. */
export function NewShipmentPage() {
  const { canOperate } = useInventoryPermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formId = useId();
  const customerFieldId = useId();
  const invalidate = useInvalidateInventory();
  const idempotency = useIdempotencyKey();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer: null,
      orderRef: '',
      shippedAt: toDateTimeLocal(new Date()),
      items: [emptyItem()],
      notes: '',
    },
  });
  const itemsArray = useFieldArray({ control: form.control, name: 'items' });
  const items = useWatch({ control: form.control, name: 'items' });
  const chosen = useMemo(
    () => new Set(items.flatMap((item) => (item.row ? [item.row.id] : []))),
    [items],
  );

  const create = useMutation({
    mutationFn: (body: ShipmentInput) => shipmentsApi.create(body, idempotency.keyFor(body)),
    onSuccess: async (shipment) => {
      idempotency.reset();
      toast.success(`Expedição ${shipment.number} registrada`, {
        description: `${shipment.customer.name} · ${shipment.items.length} item(ns)`,
      });
      await Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: ['shipments'] })]);
      void navigate(`/expedicao/${shipment.id}`);
    },
    onError: (error) => {
      toast.error('Não foi possível registrar a expedição', {
        description: getErrorMessage(error),
      });
      if (error instanceof ApiError && error.status === 409) void invalidate();
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(toDto(values));
    } catch (error) {
      applyApiErrors(form.setError, error, FIELDS);
    }
  });

  if (!canOperate) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nova expedição" />
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Seu perfil é somente leitura: expedições são registradas por administradores e
            operadores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const itemsError =
    form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="/expedicao">
          <ArrowLeftIcon />
          Expedição
        </Link>
      </Button>
      <PageHeader
        title="Nova expedição"
        description="Cada item gera uma saída no estoque do lote, no local escolhido. Tudo ou nada: se um item falhar, nada é gravado."
      />

      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="space-y-6">
        <FormRootError errors={form.formState.errors} />

        <Card>
          <CardHeader>
            <CardTitle>Destino</CardTitle>
            <CardDescription>Campos com * são obrigatórios.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="customer"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                  <FieldLabel htmlFor={customerFieldId}>
                    Cliente<span className="text-destructive">*</span>
                  </FieldLabel>
                  <EntityCombobox<Customer>
                    id={customerFieldId}
                    queryKey="customers"
                    search={searchActiveCustomers}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="Buscar por nome, documento ou e-mail (só ativos)"
                    getLabel={(c) => c.name}
                    renderOption={(c) => (
                      <div>
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[formatDocument(c.document), c.city && c.state && `${c.city}/${c.state}`]
                            .filter(Boolean)
                            .join(' · ') || 'Sem documento'}
                        </div>
                      </div>
                    )}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <TextField
              control={form.control}
              name="orderRef"
              label="Pedido / NF"
              placeholder="Pedido 2026-0457 / NF 7781"
            />
            <TextField
              control={form.control}
              name="shippedAt"
              label="Expedido em"
              required
              type="datetime-local"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
            <CardDescription>
              Um item por lote e local, só de lotes disponíveis. Quantidade na unidade do lote.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {itemsArray.fields.map((entry, index) => {
              const row = items[index]?.row ?? null;
              return (
                <div
                  key={entry.id}
                  className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start"
                >
                  <Controller
                    control={form.control}
                    name={`items.${index}.row`}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-item-${index}`} className="sr-only">
                          Lote do item {index + 1}
                        </FieldLabel>
                        <StockLotPicker
                          id={`${formId}-item-${index}`}
                          value={field.value}
                          onChange={(next) => {
                            field.onChange(next);
                            form.clearErrors(`items.${index}.quantity`);
                          }}
                          onBlur={field.onBlur}
                          invalid={fieldState.invalid}
                          exclude={chosen}
                        />
                        {fieldState.invalid ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : (
                          row && (
                            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <ProductTypeBadge type={row.product.type} />
                              {row.product.name} · {row.location.code} ({row.location.name}) ·
                              disponível {formatQuantity(row.quantity, row.unit)}
                            </p>
                          )
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-item-qty-${index}`} className="sr-only">
                          Quantidade do item {index + 1}
                        </FieldLabel>
                        <div className="relative">
                          <Input
                            id={`${formId}-item-qty-${index}`}
                            {...field}
                            inputMode="decimal"
                            placeholder="Quantidade"
                            aria-invalid={fieldState.invalid}
                            className="pr-9"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                            {row ? UNIT_SHORT[row.unit] : ''}
                          </span>
                        </div>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover item ${index + 1}`}
                    disabled={itemsArray.fields.length === 1}
                    onClick={() => itemsArray.remove(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              );
            })}
            {itemsError && <p className="text-sm text-destructive">{itemsError}</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={itemsArray.fields.length >= 50}
              onClick={() => itemsArray.append(emptyItem())}
            >
              <PlusIcon />
              Adicionar item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <TextareaField
              control={form.control}
              name="notes"
              label="Observações"
              rows={2}
              placeholder="Entrega na loja do centro"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/expedicao">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <TruckIcon />
            )}
            Registrar expedição
          </Button>
        </div>
      </form>
    </div>
  );
}

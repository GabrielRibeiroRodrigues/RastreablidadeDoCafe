import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  FactoryIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from 'cn';
import { useInventoryPermissions } from '@/auth/permissions';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { FormRootError, SelectField, TextareaField, TextField } from '@/components/form/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/features/inventory/components';
import {
  useIdempotencyKey,
  useInvalidateInventory,
  useLocations,
} from '@/features/inventory/hooks';
import { qualityShape } from '@/features/inventory/quality';
import { StockLotPicker } from '@/features/inventory/StockLotPicker';
import type { StockOption } from '@/features/inventory/stock-options';
import { LOCATION_TYPE_LABELS } from '@/features/locations/api';
import type { Product } from '@/features/products/api';
import {
  PRODUCT_TYPE_LABELS,
  ROAST_LEVEL_LABELS,
  ROASTABLE_TYPES,
} from '@/features/products/labels';
import { ApiError, getErrorMessage } from '@/lib/api';
import { getApiClient, unwrap } from '@/lib/api-client';
import { toOptions } from '@/lib/options';
import {
  UNIT_SHORT,
  formatQuantity,
  fromMilli,
  parseQuantityInput,
  toDateTimeLocal,
  toMilli,
} from '@/lib/quantity';
import { productionApi, type ProductionOrderInput, type ProductionStage } from './api';
import { ProductTypeBadge } from './components';
import { ROASTING_YIELD_RANGE, STAGES, STAGE_HINTS, STAGE_LABELS, STAGE_RULES } from './labels';
import { massPreview, type MassPreview } from './mass';

const QUANTITY_HINT = 'Informe uma quantidade positiva (até 3 casas decimais).';

const schema = z
  .object({
    stage: z.enum(STAGES),
    inputs: z.array(z.object({ row: z.custom<StockOption>().nullable(), quantity: z.string() })),
    outputProduct: z.custom<Product>().nullable(),
    outputLocationId: z.string().min(1, 'Selecione o local de saída.'),
    outputQuantity: z.string().refine((v) => parseQuantityInput(v) !== null, QUANTITY_HINT),
    performedAt: z.string().min(1, 'Informe a data da produção.'),
    expiresAt: qualityShape.expiresAt,
    cuppingScore: qualityShape.cuppingScore,
    roastLevel: qualityShape.roastLevel,
    lotNotes: qualityShape.notes,
    notes: z.string().trim().max(1000, 'Informe no máximo 1000 caracteres.'),
  })
  .superRefine((values, ctx) => {
    if (values.inputs.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'Adicione ao menos um insumo.' });
    }
    values.inputs.forEach((input, index) => {
      if (!input.row) {
        ctx.addIssue({
          code: 'custom',
          path: ['inputs', index, 'row'],
          message: 'Selecione o lote.',
        });
        return;
      }
      const quantity = parseQuantityInput(input.quantity);
      if (quantity === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['inputs', index, 'quantity'],
          message: QUANTITY_HINT,
        });
      } else if (toMilli(quantity) > toMilli(input.row.quantity)) {
        ctx.addIssue({
          code: 'custom',
          path: ['inputs', index, 'quantity'],
          message: `Disponível: ${formatQuantity(input.row.quantity, input.row.unit)}`,
        });
      }
    });
    if (!values.outputProduct) {
      ctx.addIssue({
        code: 'custom',
        path: ['outputProduct'],
        message: 'Selecione o produto gerado.',
      });
      return;
    }
    const mass = previewOf(values);
    if (mass.outputKg !== null && mass.inputKg > 0n && mass.outputKg > mass.inputKg) {
      ctx.addIssue({
        code: 'custom',
        path: ['outputQuantity'],
        message: `A saída (${formatQuantity(fromMilli(mass.outputKg), 'KG')}) não pode exceder a entrada (${formatQuantity(fromMilli(mass.inputKg), 'KG')}).`,
      });
    }
  });

type FormValues = z.infer<typeof schema>;

function previewOf(
  values: Pick<FormValues, 'inputs' | 'outputProduct' | 'outputQuantity'>,
): MassPreview {
  return massPreview(
    values.inputs.flatMap((input) =>
      input.row
        ? [{ quantity: input.quantity, unit: input.row.unit, productType: input.row.product.type }]
        : [],
    ),
    values.outputProduct
      ? { quantity: values.outputQuantity, unit: values.outputProduct.unit }
      : null,
  );
}

const FIELDS = ['outputLocationId', 'outputQuantity', 'performedAt', 'notes'] as const;

const emptyInput = (): FormValues['inputs'][number] => ({ row: null, quantity: '' });

function toDto(values: FormValues): ProductionOrderInput {
  const lot: NonNullable<ProductionOrderInput['lot']> = {
    ...(values.expiresAt && { expiresAt: values.expiresAt }),
    ...(values.cuppingScore && {
      cuppingScore: Number(values.cuppingScore.replace(',', '.')),
    }),
    ...(values.roastLevel && { roastLevel: values.roastLevel }),
    ...(values.lotNotes && { notes: values.lotNotes }),
  };
  return {
    stage: values.stage,
    inputs: values.inputs.map((input) => ({
      lotId: input.row?.lot.id ?? '',
      locationId: input.row?.location.id ?? '',
      quantity: parseQuantityInput(input.quantity) ?? input.quantity,
    })),
    outputProductId: values.outputProduct?.id ?? '',
    outputLocationId: values.outputLocationId,
    outputQuantity: parseQuantityInput(values.outputQuantity) ?? values.outputQuantity,
    performedAt: new Date(values.performedAt).toISOString(),
    ...(Object.keys(lot).length > 0 && { lot }),
    notes: values.notes || null,
  };
}

const searchProducts = (q: string, signal: AbortSignal) =>
  unwrap(
    getApiClient().GET('/v1/products', {
      params: { query: { status: 'active', pageSize: 100, sort: 'name', ...(q && { q }) } },
      signal,
    }),
  ).then((page) => page.data);

function Step({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {number}
          </span>
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const kg = (milli: bigint) => formatQuantity(fromMilli(milli), 'KG');

function MassPreviewCard({ stage, mass }: { stage: ProductionStage; mass: MassPreview }) {
  const exceeds = mass.outputKg !== null && mass.inputKg > 0n && mass.outputKg > mass.inputKg;
  const outOfRange =
    stage === 'ROASTING' &&
    mass.yieldPercent !== null &&
    !exceeds &&
    (mass.yieldPercent < ROASTING_YIELD_RANGE.min || mass.yieldPercent > ROASTING_YIELD_RANGE.max);

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Balanço de massa</CardTitle>
        <CardDescription>Prévia do cálculo da API (1 saca = 60 kg).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Entrada</dt>
            <dd className="text-lg font-semibold tabular-nums">{kg(mass.inputKg)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Saída</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {mass.outputKg === null ? '—' : kg(mass.outputKg)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rendimento estimado</dt>
            <dd
              className={cn(
                'text-lg font-semibold tabular-nums',
                (outOfRange || exceeds) && 'text-amber-700 dark:text-amber-400',
              )}
            >
              {mass.yieldPercent === null
                ? '—'
                : `${mass.yieldPercent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Perda estimada</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {mass.lossKg === null || exceeds ? '—' : kg(mass.lossKg)}
            </dd>
          </div>
        </dl>
        {mass.yieldPercent !== null && !exceeds && (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Rendimento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={mass.yieldPercent}
          >
            <div
              className={cn('h-full rounded-full', outOfRange ? 'bg-amber-500' : 'bg-primary')}
              style={{ width: `${Math.min(mass.yieldPercent, 100)}%` }}
            />
          </div>
        )}
        {exceeds && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>A saída não pode exceder a massa de entrada.</AlertDescription>
          </Alert>
        )}
        {outOfRange && (
          <Alert>
            <AlertTriangleIcon />
            <AlertDescription>
              Rendimento fora da faixa típica da torra ({ROASTING_YIELD_RANGE.min}–
              {ROASTING_YIELD_RANGE.max}%). Confira as quantidades.
            </AlertDescription>
          </Alert>
        )}
        {mass.excluded > 0 && (
          <p className="text-xs text-muted-foreground">
            {mass.excluded} insumo(s) fora do cálculo (embalagens ou quantidades em unidades).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Nova ordem de produção: etapa → insumos → saída. Envia `Idempotency-Key`. */
export function NewProductionOrderPage() {
  const { canOperate } = useInventoryPermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formId = useId();
  const productFieldId = useId();
  const invalidate = useInvalidateInventory();
  const idempotency = useIdempotencyKey();
  const locations = useLocations();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      stage: 'ROASTING',
      inputs: [emptyInput()],
      outputProduct: null,
      outputLocationId: '',
      outputQuantity: '',
      performedAt: toDateTimeLocal(new Date()),
      expiresAt: '',
      cuppingScore: '',
      roastLevel: '',
      lotNotes: '',
      notes: '',
    },
  });
  const inputsArray = useFieldArray({ control: form.control, name: 'inputs' });
  const [stage, inputs, outputProduct, outputQuantity] = useWatch({
    control: form.control,
    name: ['stage', 'inputs', 'outputProduct', 'outputQuantity'],
  });
  const rules = STAGE_RULES[stage];
  const mass = previewOf({ inputs, outputProduct, outputQuantity });
  const chosen = useMemo(
    () => new Set(inputs.flatMap((input) => (input.row ? [input.row.id] : []))),
    [inputs],
  );

  const create = useMutation({
    mutationFn: (body: ProductionOrderInput) =>
      productionApi.create(body, idempotency.keyFor(body)),
    onSuccess: async (order) => {
      idempotency.reset();
      toast.success(`${order.number} concluída — lote ${order.output.code} gerado`, {
        description: order.output.product.name,
      });
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
      ]);
      void navigate(`/producao/${order.id}`);
    },
    onError: (error) => {
      toast.error('Não foi possível registrar a ordem', { description: getErrorMessage(error) });
      // Saldo ou status mudou: recarrega os saldos oferecidos nos insumos.
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
        <PageHeader title="Nova ordem de produção" />
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Seu perfil é somente leitura: ordens de produção são registradas por administradores e
            operadores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const changeStage = (next: ProductionStage) => {
    if (next === stage) return;
    form.setValue('stage', next);
    // Insumos e produto dependem da etapa: recomeça a escolha.
    inputsArray.replace([emptyInput()]);
    form.setValue('outputProduct', null);
    form.setValue('roastLevel', '');
    form.clearErrors();
  };

  const outputUnit = outputProduct ? UNIT_SHORT[outputProduct.unit] : null;
  const roastable = outputProduct ? ROASTABLE_TYPES.includes(outputProduct.type) : false;
  const inputsError =
    form.formState.errors.inputs?.root?.message ?? form.formState.errors.inputs?.message;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="/producao">
          <ArrowLeftIcon />
          Produção
        </Link>
      </Button>
      <PageHeader
        title="Nova ordem de produção"
        description="Os insumos são consumidos e o lote gerado nasce ligado a eles, numa única operação. Correções são feitas por estorno."
      />

      <form
        id={formId}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      >
        <div className="space-y-6">
          <FormRootError errors={form.formState.errors} />

          <Step number={1} title="Etapa" description="O que está sendo feito com o café.">
            <div
              role="radiogroup"
              aria-label="Etapa"
              className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
            >
              {STAGES.map((value) => {
                const checked = value === stage;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => changeStage(value)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      checked
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'bg-background hover:bg-muted',
                    )}
                  >
                    <span className="text-sm font-semibold">{STAGE_LABELS[value]}</span>
                    <span className="text-xs text-muted-foreground">{STAGE_HINTS[value]}</span>
                  </button>
                );
              })}
            </div>
          </Step>

          <Step
            number={2}
            title="Insumos"
            description={
              <>
                Lotes consumidos ({rules.inputs.map((t) => PRODUCT_TYPE_LABELS[t]).join(', ')}), só
                disponíveis. A quantidade sai do local escolhido.
              </>
            }
          >
            <div className="space-y-3">
              {inputsArray.fields.map((item, index) => {
                const row = inputs[index]?.row ?? null;
                return (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start"
                  >
                    <Controller
                      control={form.control}
                      name={`inputs.${index}.row`}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={`${formId}-input-${index}`} className="sr-only">
                            Lote do insumo {index + 1}
                          </FieldLabel>
                          <StockLotPicker
                            id={`${formId}-input-${index}`}
                            value={field.value}
                            onChange={(next) => {
                              field.onChange(next);
                              form.clearErrors(`inputs.${index}.quantity`);
                            }}
                            onBlur={field.onBlur}
                            invalid={fieldState.invalid}
                            productTypes={rules.inputs}
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
                      name={`inputs.${index}.quantity`}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor={`${formId}-input-qty-${index}`} className="sr-only">
                            Quantidade do insumo {index + 1}
                          </FieldLabel>
                          <div className="relative">
                            <Input
                              id={`${formId}-input-qty-${index}`}
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
                      aria-label={`Remover insumo ${index + 1}`}
                      disabled={inputsArray.fields.length === 1}
                      onClick={() => inputsArray.remove(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                );
              })}
              {inputsError && <p className="text-sm text-destructive">{inputsError}</p>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={inputsArray.fields.length >= 20}
                onClick={() => inputsArray.append(emptyInput())}
              >
                <PlusIcon />
                Adicionar insumo
              </Button>
            </div>
          </Step>

          <Step
            number={3}
            title="Saída"
            description={
              <>
                Produto gerado ({rules.output.map((t) => PRODUCT_TYPE_LABELS[t]).join(' ou ')}),
                local e quantidade. O lote recebe um código novo.
              </>
            }
          >
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="outputProduct"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
                      <FieldLabel htmlFor={productFieldId}>
                        Produto gerado<span className="text-destructive">*</span>
                      </FieldLabel>
                      <EntityCombobox<Product>
                        id={productFieldId}
                        queryKey="products-output"
                        search={searchProducts}
                        filter={(p) => rules.output.includes(p.type)}
                        value={field.value}
                        onChange={(next) => {
                          field.onChange(next);
                          if (!next || !ROASTABLE_TYPES.includes(next.type)) {
                            form.setValue('roastLevel', '');
                          }
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
                <SelectField
                  control={form.control}
                  name="outputLocationId"
                  label="Local de saída"
                  required
                  placeholder={locations.isPending ? 'Carregando…' : 'Selecione'}
                  options={(locations.data?.data ?? []).map((l) => ({
                    value: l.id,
                    label: `${l.code} · ${l.name} (${LOCATION_TYPE_LABELS[l.type]})`,
                  }))}
                  description="Local de quarentena: o lote nasce em quarentena."
                />
                <TextField
                  control={form.control}
                  name="outputQuantity"
                  label={
                    outputUnit ? `Quantidade produzida (${outputUnit})` : 'Quantidade produzida'
                  }
                  required
                  inputMode="decimal"
                  placeholder="98"
                  description={
                    outputProduct
                      ? `Na unidade do produto: ${outputUnit}.`
                      : 'Selecione o produto para ver a unidade.'
                  }
                />
                <TextField
                  control={form.control}
                  name="performedAt"
                  label="Produzido em"
                  required
                  type="datetime-local"
                />
              </div>

              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Dados do lote gerado (opcional)</p>
                  <p className="text-xs text-muted-foreground">
                    Safra e variedade são herdadas quando todos os insumos coincidem; sem grau de
                    torra, vale o padrão do produto.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField control={form.control} name="expiresAt" label="Validade" type="date" />
                  <TextField
                    control={form.control}
                    name="cuppingScore"
                    label="Pontuação SCA"
                    inputMode="decimal"
                    placeholder="86,5"
                  />
                  {roastable ? (
                    <SelectField
                      control={form.control}
                      name="roastLevel"
                      label="Grau de torra"
                      options={toOptions(ROAST_LEVEL_LABELS)}
                      noneLabel={
                        outputProduct?.defaultRoastLevel
                          ? `Padrão (${ROAST_LEVEL_LABELS[outputProduct.defaultRoastLevel]})`
                          : 'Não informado'
                      }
                    />
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>
                <TextareaField
                  control={form.control}
                  name="lotNotes"
                  label="Observações do lote"
                  rows={2}
                  placeholder="Notas de prova, perfil sensorial…"
                />
              </div>

              <TextareaField
                control={form.control}
                name="notes"
                label="Observações da ordem"
                rows={2}
                placeholder="Torrador 2, perfil 12 min"
              />
            </div>
          </Step>
        </div>

        {/* No celular a prévia vem antes dos botões; no desktop fica fixa à direita. */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">
          <MassPreviewCard stage={stage} mass={mass} />
        </div>

        <div className="flex justify-end gap-2 lg:col-start-1">
          <Button variant="outline" asChild>
            <Link to="/producao">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <FactoryIcon />
            )}
            Registrar ordem
          </Button>
        </div>
      </form>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import { useId, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from 'cn';
import { useInventoryPermissions } from '@/auth/permissions';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, SelectField, TextareaField, TextField } from '@/components/form/fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { LOCATION_TYPE_LABELS } from '@/features/locations/api';
import { ApiError, getErrorMessage } from '@/lib/api';
import {
  UNIT_SHORT,
  formatQuantity,
  formatQuantityRaw,
  parseQuantityInput,
  toMilli,
} from '@/lib/quantity';
import { inventoryApi, type LotDetail, type ManualMovementType, type MovementInput } from './api';
import { useIdempotencyKey, useInvalidateInventory, useLocations } from './hooks';
import { LOT_STATUS_LABELS, MOVEMENT_TYPE_LABELS } from './labels';

const TYPES: Array<{ value: ManualMovementType; hint: string; adminOnly?: boolean }> = [
  { value: 'ISSUE', hint: 'Venda ou expedição: o café sai do estoque.' },
  { value: 'TRANSFER', hint: 'Muda o café de local, sem alterar o saldo total.' },
  { value: 'CONSUMPTION', hint: 'Consumo em produção (torra, blend).' },
  {
    value: 'ADJUSTMENT',
    hint: 'Correção de inventário: perda (sai da origem) ou sobra (entra no destino).',
    adminOnly: true,
  },
];

type Direction = 'loss' | 'gain';

interface FormValues {
  type: ManualMovementType;
  direction: Direction;
  fromLocationId: string;
  toLocationId: string;
  quantity: string;
  documentRef: string;
  reason: string;
}

const needsFrom = (type: ManualMovementType, direction: Direction) =>
  type === 'ADJUSTMENT' ? direction === 'loss' : true;
const needsTo = (type: ManualMovementType, direction: Direction) =>
  type === 'TRANSFER' || (type === 'ADJUSTMENT' && direction === 'gain');

function buildSchema(lot: LotDetail) {
  const available = new Map(lot.stock.map((row) => [row.location.id, row]));
  return z
    .object({
      type: z.enum(['ISSUE', 'TRANSFER', 'CONSUMPTION', 'ADJUSTMENT']),
      direction: z.enum(['loss', 'gain']),
      fromLocationId: z.string(),
      toLocationId: z.string(),
      quantity: z.string(),
      documentRef: z.string().trim().max(60, 'Informe no máximo 60 caracteres.'),
      reason: z.string().trim().max(500, 'Informe no máximo 500 caracteres.'),
    })
    .superRefine((values, ctx) => {
      const from = needsFrom(values.type, values.direction);
      const to = needsTo(values.type, values.direction);
      if (from && !values.fromLocationId) {
        ctx.addIssue({ code: 'custom', path: ['fromLocationId'], message: 'Selecione a origem.' });
      }
      if (to && !values.toLocationId) {
        ctx.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Selecione o destino.' });
      }
      if (from && to && values.fromLocationId && values.fromLocationId === values.toLocationId) {
        ctx.addIssue({
          code: 'custom',
          path: ['toLocationId'],
          message: 'O destino deve ser diferente da origem.',
        });
      }
      const quantity = parseQuantityInput(values.quantity);
      if (quantity === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'Informe uma quantidade positiva (até 3 casas decimais).',
        });
      } else if (from && values.fromLocationId) {
        const row = available.get(values.fromLocationId);
        const max = row?.quantity ?? '0';
        if (toMilli(quantity) > toMilli(max)) {
          ctx.addIssue({
            code: 'custom',
            path: ['quantity'],
            message: `Saldo insuficiente em ${row?.location.code ?? 'origem'}: disponível ${formatQuantityRaw(max)}`,
          });
        }
      }
      if (values.type === 'ADJUSTMENT' && values.reason.length < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['reason'],
          message: 'Informe o motivo do ajuste (pelo menos 3 caracteres).',
        });
      }
    });
}

function toDto(lot: LotDetail, values: FormValues): MovementInput {
  return {
    type: values.type,
    lotId: lot.id,
    ...(needsFrom(values.type, values.direction) && { fromLocationId: values.fromLocationId }),
    ...(needsTo(values.type, values.direction) && { toLocationId: values.toLocationId }),
    quantity: parseQuantityInput(values.quantity) ?? values.quantity,
    documentRef: values.documentRef || null,
    reason: values.reason || null,
  };
}

const FIELDS = ['fromLocationId', 'toLocationId', 'quantity', 'documentRef', 'reason'] as const;

/** Saída, transferência, consumo ou ajuste do lote. Envia `Idempotency-Key`. */
export function MoveLotDialog({
  lot,
  open,
  onOpenChange,
}: {
  lot: LotDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { canAdjust } = useInventoryPermissions();
  const formId = useId();
  const invalidate = useInvalidateInventory();
  const idempotency = useIdempotencyKey();
  const locations = useLocations();
  const schema = useMemo(() => buildSchema(lot), [lot]);
  const unit = UNIT_SHORT[lot.unit];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'ISSUE',
      direction: 'loss',
      fromLocationId: lot.stock.length === 1 ? (lot.stock[0]?.location.id ?? '') : '',
      toLocationId: '',
      quantity: '',
      documentRef: '',
      reason: '',
    },
  });
  const [type, direction, fromLocationId] = useWatch({
    control: form.control,
    name: ['type', 'direction', 'fromLocationId'],
  });
  const showFrom = needsFrom(type, direction);
  const showTo = needsTo(type, direction);
  const fromRow = lot.stock.find((row) => row.location.id === fromLocationId);

  const move = useMutation({
    mutationFn: (body: MovementInput) => inventoryApi.move(body, idempotency.keyFor(body)),
    onSuccess: async (movement) => {
      idempotency.reset();
      toast.success(`${MOVEMENT_TYPE_LABELS[movement.type]} registrada`, {
        description: `${lot.code} · ${formatQuantity(movement.quantity, lot.unit)}`,
      });
      onOpenChange(false);
      form.reset();
      await invalidate();
    },
    onError: (error) => {
      toast.error('Não foi possível movimentar o lote', { description: getErrorMessage(error) });
      // Conflito (saldo ou status mudou por outro usuário): atualiza o lote e os saldos exibidos.
      if (error instanceof ApiError && error.status === 409) void invalidate();
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await move.mutateAsync(toDto(lot, values));
    } catch (error) {
      applyApiErrors(form.setError, error, FIELDS);
    }
  });

  const destinations = (locations.data?.data ?? [])
    .filter((location) => !showFrom || location.id !== fromLocationId)
    .map((location) => ({
      value: location.id,
      label: `${location.code} · ${location.name} (${LOCATION_TYPE_LABELS[location.type]})`,
    }));

  const typeHint = TYPES.find((t) => t.value === type)?.hint;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (move.isPending) return;
        onOpenChange(next);
        if (!next) form.reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Movimentar {lot.code}</DialogTitle>
          <DialogDescription>
            Saldo total: {formatQuantity(lot.balance, lot.unit)}. Movimentações não podem ser
            editadas; corrija com estorno.
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="-mx-4 max-h-[65vh] space-y-4 overflow-y-auto px-4 py-1"
        >
          <FormRootError errors={form.formState.errors} />

          {lot.status !== 'AVAILABLE' && (
            <Alert>
              <AlertTriangleIcon />
              <AlertDescription>
                Lote {LOT_STATUS_LABELS[lot.status].toLowerCase()}: não pode sair do local
                {lot.status === 'QUARANTINE' && ', exceto para um local de quarentena'}.
              </AlertDescription>
            </Alert>
          )}

          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Field>
                <FieldLabel>Tipo</FieldLabel>
                <div role="radiogroup" aria-label="Tipo" className="flex flex-wrap gap-1.5">
                  {TYPES.filter((t) => !t.adminOnly || canAdjust).map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={field.value === t.value}
                      onClick={() => {
                        field.onChange(t.value);
                        form.clearErrors();
                      }}
                      className={cn(
                        'h-8 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        field.value === t.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted',
                      )}
                    >
                      {MOVEMENT_TYPE_LABELS[t.value]}
                    </button>
                  ))}
                </div>
                {typeHint && <p className="text-xs text-muted-foreground">{typeHint}</p>}
              </Field>
            )}
          />

          {type === 'ADJUSTMENT' && (
            <Controller
              control={form.control}
              name="direction"
              render={({ field }) => (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Ajuste de</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(
                      [
                        ['loss', 'Perda (sai da origem)'],
                        ['gain', 'Sobra (entra no destino)'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={field.name}
                          value={value}
                          checked={field.value === value}
                          onChange={() => field.onChange(value)}
                          className="accent-primary"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {showFrom && (
              <SelectField
                control={form.control}
                name="fromLocationId"
                label="Origem"
                required
                placeholder={lot.stock.length ? 'Selecione' : 'Lote sem saldo'}
                options={lot.stock.map((row) => ({
                  value: row.location.id,
                  label: `${row.location.code} — disponível ${formatQuantity(row.quantity, lot.unit)}`,
                }))}
              />
            )}
            {showTo && (
              <SelectField
                control={form.control}
                name="toLocationId"
                label="Destino"
                required
                placeholder={locations.isPending ? 'Carregando…' : 'Selecione'}
                options={destinations}
              />
            )}
            <TextField
              control={form.control}
              name="quantity"
              label={`Quantidade (${unit})`}
              required
              inputMode="decimal"
              placeholder="10"
              description={
                showFrom && fromRow
                  ? `Disponível em ${fromRow.location.code}: ${formatQuantity(fromRow.quantity, lot.unit)}`
                  : 'Use vírgula para decimais.'
              }
            />
            <TextField
              control={form.control}
              name="documentRef"
              label="Documento"
              placeholder="Pedido 2026-0457"
            />
          </div>
          <TextareaField
            control={form.control}
            name="reason"
            label="Motivo"
            required={type === 'ADJUSTMENT'}
            rows={2}
            placeholder={type === 'ADJUSTMENT' ? 'Quebra no inventário mensal' : 'Opcional'}
          />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={move.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={move.isPending}>
            {move.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
            Registrar {MOVEMENT_TYPE_LABELS[type].toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMutation } from '@tanstack/react-query';
import { CircleAlertIcon, Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { formatQuantity } from '@/lib/quantity';
import { inventoryApi, type LotDetail, type Movement, type SettableLotStatus } from './api';
import { MovementRoute } from './components';
import { useInvalidateInventory } from './hooks';
import { LOT_STATUS_LABELS, MOVEMENT_TYPE_LABELS, SETTABLE_STATUS_LABELS } from './labels';

const MIN_REASON = 3;

/**
 * Diálogo com texto obrigatório (motivo, justificativa, notas); o erro da API aparece no topo e o
 * diálogo continua aberto.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  destructive,
  pending,
  error,
  onSubmit,
  reasonPlaceholder,
  fieldLabel = 'Motivo',
  minLength = MIN_REASON,
  maxLength = 500,
  dismissLabel = 'Cancelar',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: unknown;
  onSubmit: (reason: string) => void;
  reasonPlaceholder: string;
  fieldLabel?: string;
  minLength?: number;
  maxLength?: number;
  /** Botão que fecha sem fazer nada (ex.: "Voltar" quando a ação já é um cancelamento). */
  dismissLabel?: string;
}) {
  const formId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = touched && reason.trim().length < minLength;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (reason.trim().length >= minLength) onSubmit(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="space-y-4">
          {error !== null && error !== undefined && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{getErrorMessage(error)}</AlertDescription>
            </Alert>
          )}
          {children}
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={reasonId}>
              {fieldLabel}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id={reasonId}
              rows={3}
              value={reason}
              aria-invalid={invalid}
              placeholder={reasonPlaceholder}
              maxLength={maxLength}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            {invalid && (
              <FieldError
                errors={[
                  {
                    message: `${fieldLabel}: informe pelo menos ${minLength} caracteres.`,
                  },
                ]}
              />
            )}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {dismissLabel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
          >
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Estorno (admin): nova movimentação com origem e destino invertidos. */
export function ReverseMovementDialog({
  movement,
  lot,
  onClose,
}: {
  movement: Movement;
  lot: LotDetail;
  onClose: () => void;
}) {
  const invalidate = useInvalidateInventory();
  const reverse = useMutation({
    mutationFn: (reason: string) => inventoryApi.reverse(movement.id, reason),
    onSuccess: async () => {
      toast.success('Movimentação estornada', {
        description: `${MOVEMENT_TYPE_LABELS[movement.type]} de ${formatQuantity(movement.quantity, lot.unit)}`,
      });
      onClose();
      await invalidate();
    },
    onError: (error) =>
      toast.error('Não foi possível estornar', { description: getErrorMessage(error) }),
  });

  return (
    <ReasonDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Estornar movimentação?"
      description={
        <>
          {MOVEMENT_TYPE_LABELS[movement.type]} de{' '}
          <strong className="font-medium text-foreground">
            {formatQuantity(movement.quantity, lot.unit)}
          </strong>{' '}
          (<MovementRoute movement={movement} />
          ). Será lançada uma movimentação inversa; a original fica no histórico.
        </>
      }
      confirmLabel="Estornar"
      destructive
      pending={reverse.isPending}
      error={reverse.error}
      onSubmit={(reason) => reverse.mutate(reason)}
      reasonPlaceholder="Lançado no lote errado"
    />
  );
}

/** Alterar status: operador só põe em quarentena; admin também bloqueia e libera. */
export function ChangeStatusDialog({
  lot,
  statuses,
  onClose,
}: {
  lot: LotDetail;
  statuses: SettableLotStatus[];
  onClose: () => void;
}) {
  const invalidate = useInvalidateInventory();
  const selectId = useId();
  const options = statuses.filter((status) => status !== lot.status);
  const [status, setStatus] = useState<SettableLotStatus | undefined>(options[0]);

  const change = useMutation({
    mutationFn: ({ next, reason }: { next: SettableLotStatus; reason: string }) =>
      inventoryApi.changeStatus(lot.id, next, reason),
    onSuccess: async (updated) => {
      toast.success(`Lote ${updated.code}: ${LOT_STATUS_LABELS[updated.status].toLowerCase()}`);
      onClose();
      await invalidate();
    },
    onError: (error) =>
      toast.error('Não foi possível alterar o status', { description: getErrorMessage(error) }),
  });

  return (
    <ReasonDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Alterar status de ${lot.code}`}
      description={`Status atual: ${LOT_STATUS_LABELS[lot.status]}. Lotes em quarentena ou bloqueados não podem sair do local.`}
      confirmLabel="Alterar status"
      pending={change.isPending}
      error={change.error}
      onSubmit={(reason) => status && change.mutate({ next: status, reason })}
      reasonPlaceholder="Umidade acima de 12,5% na análise de recebimento"
    >
      <Field>
        <FieldLabel htmlFor={selectId}>Novo status</FieldLabel>
        <Select value={status ?? ''} onValueChange={(v) => setStatus(v as SettableLotStatus)}>
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {SETTABLE_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </ReasonDialog>
  );
}

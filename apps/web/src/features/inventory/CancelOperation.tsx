import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BanIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/quantity';
import { INVENTORY_KEYS } from './api';
import { ReasonDialog } from './ReasonDialogs';

/** Tudo que um cancelamento muda: razão, operações, rastreio, painel e recalls simulados. */
const CANCELLATION_KEYS = [
  ...INVENTORY_KEYS,
  'shipments',
  'production-orders',
  'trace',
  'dashboard',
] as const;

export interface Cancellation {
  cancelledAt: string;
  reason: string;
  user: { id: string; name: string };
}

/** Aviso no topo de uma ordem ou expedição cancelada: quem, quando e por quê. */
export function CancellationAlert({
  cancellation,
  children,
}: {
  cancellation: Cancellation;
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <BanIcon />
      <AlertTitle>Cancelada</AlertTitle>
      <AlertDescription>
        <p>
          Por <span className="font-medium">{cancellation.user.name}</span> em{' '}
          {formatDateTime(cancellation.cancelledAt)}: {cancellation.reason}
        </p>
        {children}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Cancelamento (admin) com motivo obrigatório: a API estorna todas as movimentações da operação
 * numa transação. O erro (ex.: lote gerado já usado) aparece no diálogo, que continua aberto.
 */
export function CancelOperationDialog({
  title,
  description,
  successMessage,
  reasonPlaceholder,
  cancel,
  onClose,
}: {
  title: string;
  description: ReactNode;
  successMessage: string;
  reasonPlaceholder: string;
  cancel: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: cancel,
    onSuccess: async () => {
      toast.success(successMessage);
      onClose();
      await Promise.all(
        CANCELLATION_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    },
    onError: (error) =>
      toast.error('Não foi possível cancelar', { description: getErrorMessage(error) }),
  });

  return (
    <ReasonDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
      confirmLabel="Confirmar cancelamento"
      dismissLabel="Voltar"
      destructive
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(reason) => mutation.mutate(reason)}
      reasonPlaceholder={reasonPlaceholder}
      minLength={5}
    />
  );
}

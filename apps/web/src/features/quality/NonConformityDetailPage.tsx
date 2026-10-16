import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, InfoIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { useQualityPermissions } from '@/auth/permissions';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { inventoryApi } from '@/features/inventory/api';
import { LotStatusBadge, Quantity } from '@/features/inventory/components';
import { ReasonDialog } from '@/features/inventory/ReasonDialogs';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime, formatQuantity, toMilli } from '@/lib/quantity';
import { nonConformitiesApi, type NonConformity } from './api';
import { NcStatusBadge, NcTypeBadge } from './components';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function NonConformityDetailPage() {
  const { id = '' } = useParams();
  const { canResolveNc } = useQualityPermissions();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'release' | 'discard' | null>(null);

  const query = useQuery({
    queryKey: ['non-conformities', 'detail', id],
    queryFn: ({ signal }) => nonConformitiesApi.get(id, signal),
  });
  const lotId = query.data?.lot.id;
  // Saldo por local: o descarte baixa tudo (ajuste de perda) e o lote termina consumido.
  const lot = useQuery({
    queryKey: ['lots', 'detail', lotId],
    queryFn: ({ signal }) => inventoryApi.getLot(lotId ?? '', signal),
    enabled: Boolean(lotId),
  });

  const onResolved = async (nc: NonConformity, verb: string) => {
    toast.success(`${nc.number} ${verb}`, {
      description: `Lote ${nc.lot.code}: ${nc.lot.status === 'AVAILABLE' ? 'disponível' : nc.lot.status === 'CONSUMED' ? 'saldo baixado (consumido)' : 'status mantido'}.`,
    });
    queryClient.setQueryData(['non-conformities', 'detail', id], nc);
    setDialog(null);
    await Promise.all(
      ['non-conformities', 'lots', 'stock', 'movements'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };

  const release = useMutation({
    mutationFn: (justification: string) => nonConformitiesApi.release(id, justification),
    onSuccess: (nc) => onResolved(nc, 'liberada'),
    onError: (error) =>
      toast.error('Não foi possível liberar', { description: getErrorMessage(error) }),
  });
  const discard = useMutation({
    mutationFn: (justification: string) => nonConformitiesApi.discard(id, justification),
    onSuccess: (nc) => onResolved(nc, 'descartada'),
    onError: (error) =>
      toast.error('Não foi possível descartar', { description: getErrorMessage(error) }),
  });

  const crumbs = [
    { label: 'Qualidade', to: '/qualidade' },
    { label: query.data?.number ?? 'Não conformidade' },
  ];

  if (query.isPending) return <DetailPageSkeleton breadcrumbs={crumbs} cards={2} />;
  if (query.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={query.error}
        onRetry={() => void query.refetch()}
        entity="Não conformidade"
        backTo="/qualidade"
        backLabel="Ver não conformidades"
      />
    );
  }

  const nc = query.data;
  const isOpen = nc.status === 'OPEN';
  const stock = lot.data?.stock ?? [];
  const hasBalance = lot.data ? toMilli(lot.data.balance) > 0n : false;

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={nc.number}
        documentTitle={`Não conformidade ${nc.number}`}
        breadcrumbs={crumbs}
        badges={
          <>
            <NcStatusBadge status={nc.status} className="h-6 px-2.5 text-sm" />
            <NcTypeBadge type={nc.type} className="h-6 px-2.5 text-sm" />
          </>
        }
        description={
          <>
            Aberta em {formatDateTime(nc.openedAt)} por{' '}
            <span className="font-medium text-foreground">{nc.openedBy.name}</span>
          </>
        }
        actions={
          canResolveNc &&
          isOpen && (
            <>
              <Button variant="outline" onClick={() => setDialog('discard')}>
                <Trash2Icon />
                Descartar
              </Button>
              <Button onClick={() => setDialog('release')}>
                <CheckCircle2Icon />
                Liberar
              </Button>
            </>
          )
        }
      />

      {isOpen && !canResolveNc && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Só administradores liberam ou descartam uma não conformidade.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Descrição</CardDescription>
            <CardTitle className="text-base leading-snug font-medium whitespace-pre-line">
              {nc.description}
            </CardTitle>
          </CardHeader>
          {!isOpen && (
            <CardContent className="space-y-2 border-t pt-4">
              <dl className="grid grid-cols-2 gap-4">
                <Info label={nc.status === 'RELEASED' ? 'Liberada por' : 'Descartada por'}>
                  {nc.resolvedBy?.name ?? '—'}
                </Info>
                <Info label="Em">{nc.resolvedAt ? formatDateTime(nc.resolvedAt) : '—'}</Info>
              </dl>
              <div>
                <p className="text-xs text-muted-foreground">Justificativa</p>
                <p className="text-sm whitespace-pre-line">{nc.resolution ?? '—'}</p>
              </div>
              {nc.status === 'DISCARDED' && (
                <Link
                  to={`/movimentacoes?lotId=${nc.lot.id}`}
                  className="inline-block text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver ajustes de perda nas movimentações
                </Link>
              )}
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Lote</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Link
                to={`/lotes/${nc.lot.id}`}
                className="font-mono text-primary underline-offset-4 hover:underline"
              >
                {nc.lot.code}
              </Link>
              <LotStatusBadge status={lot.data?.status ?? nc.lot.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {lot.data && (
              <>
                <p>{lot.data.product.name}</p>
                <p>
                  Saldo:{' '}
                  <span className="font-medium text-foreground">
                    <Quantity value={lot.data.balance} unit={lot.data.unit} />
                  </span>
                </p>
              </>
            )}
            <p className="text-xs">
              Lote em quarentena não sai do local (exceto para uma área de quarentena).
            </p>
          </CardContent>
        </Card>
      </div>

      {dialog === 'release' && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={`Liberar ${nc.number}?`}
          description={`O lote ${nc.lot.code} volta a Disponível se estava em quarentena, não tem outra NC aberta e não está num recall em andamento.`}
          confirmLabel="Liberar"
          fieldLabel="Justificativa"
          maxLength={1000}
          pending={release.isPending}
          error={release.error}
          onSubmit={(text) => release.mutate(text)}
          reasonPlaceholder="Reanálise com umidade de 11,9%: lote dentro do padrão"
        />
      )}
      {dialog === 'discard' && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={`Descartar o lote ${nc.lot.code}?`}
          description="O saldo é baixado por ajuste de perda em cada local (documento = número da NC) e o lote termina Consumido. Não dá para desfazer pelo sistema."
          confirmLabel="Descartar lote"
          destructive
          fieldLabel="Justificativa"
          maxLength={1000}
          pending={discard.isPending}
          error={discard.error}
          onSubmit={(text) => discard.mutate(text)}
          reasonPlaceholder="Lote condenado pelo laboratório"
        >
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>
              {lot.isPending
                ? 'Carregando saldo…'
                : hasBalance && lot.data
                  ? `Baixa de ${formatQuantity(lot.data.balance, lot.data.unit)}`
                  : 'Lote sem saldo: nada a baixar'}
            </AlertTitle>
            {stock.length > 0 && lot.data && (
              <AlertDescription>
                <ul className="mt-1 space-y-0.5">
                  {stock.map((row) => (
                    <li key={row.location.id}>
                      <span className="font-mono text-xs">{row.location.code}</span>{' '}
                      {row.location.name}: {formatQuantity(row.quantity, lot.data.unit)}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        </ReasonDialog>
      )}
    </div>
  );
}

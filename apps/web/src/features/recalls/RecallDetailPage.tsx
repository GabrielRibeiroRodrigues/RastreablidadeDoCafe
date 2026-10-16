import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  CircleAlertIcon,
  ClipboardCopyIcon,
  FileDownIcon,
  GitForkIcon,
  InfoIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  RotateCwIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { useQualityPermissions } from '@/auth/permissions';
import { ConfirmDialog } from '@/components/catalog/ConfirmDialog';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LotStatusBadge, Quantity } from '@/features/inventory/components';
import { ReasonDialog } from '@/features/inventory/ReasonDialogs';
import { ProductTypeBadge } from '@/features/production/components';
import { traceApi, type TraceShipment } from '@/features/trace/api';
import { getErrorMessage } from '@/lib/api';
import { formatPhone } from '@/lib/br';
import { formatDateTime, formatQuantity } from '@/lib/quantity';
import { recallsApi, type RecallDetail } from './api';
import { RecallStatusBadge, SeverityBadge, StepsTimeline, UnitQuantities } from './components';

const POLL_MS = 2500;

/** Texto para colar num e-mail ou planilha: um bloco por cliente. */
function contactListText(recall: RecallDetail, shipments: Map<string, TraceShipment>): string {
  const lines = [
    `Recall ${recall.number} — lote de origem ${recall.originLot.code}`,
    `Motivo: ${recall.reason}`,
    `Clientes a contatar (${recall.customers.length}):`,
    '',
  ];
  recall.customers.forEach((row, index) => {
    const { customer } = row;
    const place = [customer.city, customer.state].filter(Boolean).join('/');
    lines.push(`${index + 1}. ${customer.name}${place ? ` — ${place}` : ''}`);
    const contact = [
      customer.email && `E-mail: ${customer.email}`,
      customer.phone && `Telefone: ${formatPhone(customer.phone)}`,
    ].filter(Boolean);
    lines.push(`   ${contact.length > 0 ? contact.join(' | ') : 'Sem contato cadastrado'}`);
    const shipmentText = row.shipmentNumbers.map((number) => {
      const shipment = shipments.get(number);
      return shipment
        ? `${number} (${formatDateTime(shipment.shippedAt)}, ${shipment.lotCode}, ${formatQuantity(shipment.quantity, shipment.unit)})`
        : number;
    });
    lines.push(`   Expedições: ${shipmentText.join('; ')}`);
    lines.push(
      `   Quantidade recebida: ${row.quantities.map((q) => formatQuantity(q.quantity, q.unit)).join(' + ')}`,
    );
  });
  return lines.join('\n');
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function RecallDetailPage() {
  const { id = '' } = useParams();
  const { canManageRecall } = useQualityPermissions();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'retry' | 'close' | null>(null);
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ['recalls', 'detail', id],
    queryFn: ({ signal }) => recallsApi.get(id, signal),
    // Step Functions: o progresso das etapas aparece no GET; acompanha enquanto executa.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'EXECUTING' || status === 'OPEN' ? POLL_MS : false;
    },
  });
  const originLotId = query.data?.originLot.id;
  // Datas e quantidades por expedição (o detalhe do recall traz só os números).
  const forward = useQuery({
    queryKey: ['trace', 'forward', originLotId],
    queryFn: ({ signal }) => traceApi.forward(originLotId ?? '', signal),
    enabled: Boolean(originLotId) && (query.data?.customers.length ?? 0) > 0,
    staleTime: 60_000,
  });
  const shipments = new Map((forward.data?.shipments ?? []).map((s) => [s.number, s]));

  const onSettled = async (recall: RecallDetail) => {
    queryClient.setQueryData(['recalls', 'detail', id], recall);
    setDialog(null);
    await Promise.all(
      ['recalls', 'lots', 'stock'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };

  const retry = useMutation({
    mutationFn: () => recallsApi.retry(id),
    onSuccess: async (recall) => {
      toast.success(
        recall.status === 'FAILED'
          ? `Recall ${recall.number}: a etapa falhou de novo`
          : `Recall ${recall.number} retomado`,
      );
      await onSettled(recall);
    },
    onError: (error) =>
      toast.error('Não foi possível retomar', { description: getErrorMessage(error) }),
  });

  const close = useMutation({
    mutationFn: (notes: string) => recallsApi.close(id, notes),
    onSuccess: async (recall) => {
      toast.success(`Recall ${recall.number} encerrado`);
      await onSettled(recall);
    },
    onError: (error) =>
      toast.error('Não foi possível encerrar', { description: getErrorMessage(error) }),
  });

  const report = useMutation({
    mutationFn: () => recallsApi.report(id),
    onError: (error) =>
      toast.error('Não foi possível abrir o relatório', { description: getErrorMessage(error) }),
  });

  const onReport = async () => {
    // A aba é aberta já no clique (senão o bloqueador de pop-ups a barra após o await).
    const tab = window.open('', '_blank');
    try {
      const { url } = await report.mutateAsync();
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
    }
  };

  const crumbs = [
    { label: 'Qualidade' },
    { label: 'Recall', to: '/recall' },
    { label: query.data?.number ?? 'Recall' },
  ];

  if (query.isPending) return <DetailPageSkeleton breadcrumbs={crumbs} cards={2} />;

  if (query.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={query.error}
        onRetry={() => void query.refetch()}
        entity="Recall"
        backTo="/recall"
        backLabel="Ver recalls"
      />
    );
  }

  const recall = query.data;
  const running = recall.status === 'EXECUTING' || recall.status === 'OPEN';
  const canRetry = canManageRecall && recall.status === 'FAILED';
  const canClose = canManageRecall && (recall.status === 'COMPLETED' || recall.status === 'FAILED');

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(contactListText(recall, shipments));
      setCopied(true);
      toast.success('Lista de clientes copiada');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar', {
        description: 'O navegador bloqueou a área de transferência.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={recall.number}
        documentTitle={`Recall ${recall.number}`}
        breadcrumbs={crumbs}
        badges={
          <>
            <RecallStatusBadge status={recall.status} className="h-6 px-2.5 text-sm" />
            <SeverityBadge severity={recall.severity} className="h-6 px-2.5 text-sm" />
          </>
        }
        description={
          <>
            Lote de origem{' '}
            <Link
              to={`/lotes/${recall.originLot.id}`}
              className="font-mono font-medium text-primary underline-offset-4 hover:underline"
            >
              {recall.originLot.code}
            </Link>{' '}
            · aberto em {formatDateTime(recall.createdAt)} por{' '}
            <span className="font-medium text-foreground">{recall.createdBy.name}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/lotes/${recall.originLot.id}/rastreabilidade?aba=destino`}>
                <GitForkIcon />
                Rastreabilidade
              </Link>
            </Button>
            {recall.hasReport && (
              <Button variant="outline" onClick={() => void onReport()} disabled={report.isPending}>
                {report.isPending ? (
                  <Loader2Icon className="animate-spin" aria-hidden />
                ) : (
                  <FileDownIcon />
                )}
                Relatório PDF
              </Button>
            )}
            {canRetry && (
              <Button onClick={() => setDialog('retry')}>
                <RotateCwIcon />
                Tentar de novo
              </Button>
            )}
            {canClose && (
              <Button
                variant={recall.status === 'FAILED' ? 'outline' : 'default'}
                onClick={() => setDialog('close')}
              >
                <LockIcon />
                Encerrar
              </Button>
            )}
          </>
        }
      />

      {running && (
        <Alert>
          <Loader2Icon className="animate-spin" />
          <AlertTitle>Recall em execução</AlertTitle>
          <AlertDescription>
            As etapas rodam em segundo plano; esta página se atualiza sozinha.
          </AlertDescription>
        </Alert>
      )}
      {recall.status === 'FAILED' && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Uma etapa falhou</AlertTitle>
          <AlertDescription>
            {recall.lastError ?? 'Sem detalhes do erro.'}{' '}
            {canManageRecall
              ? '"Tentar de novo" retoma a partir da etapa que falhou (as concluídas não são refeitas).'
              : 'Um administrador pode retomar o recall.'}
          </AlertDescription>
        </Alert>
      )}
      {recall.status === 'CLOSED' && (
        <Alert>
          <LockIcon />
          <AlertTitle>
            Encerrado em {formatDateTime(recall.closedAt)}
            {recall.closedBy && ` por ${recall.closedBy.name}`}
          </AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-line">{recall.closingNotes ?? 'Sem notas.'}</p>
            <p className="mt-1">
              Os lotes continuam bloqueados: a liberação é feita lote a lote, no detalhe de cada um.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* Coluna principal: o que aconteceu e quem precisa ser contatado. */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardDescription>Motivo</CardDescription>
              <CardTitle className="text-base leading-snug font-medium whitespace-pre-line">
                {recall.reason}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Info label="Lotes afetados">{recall.lotsCount}</Info>
                <Info label="Clientes a contatar">{recall.customersCount}</Info>
                <Info label="Iniciado em">
                  {recall.startedAt ? formatDateTime(recall.startedAt) : '—'}
                </Info>
                <Info label="Concluído em">
                  {recall.completedAt ? formatDateTime(recall.completedAt) : '—'}
                </Info>
              </dl>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">Clientes a contatar</h2>
              {recall.customers.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => void onCopy()}>
                  {copied ? <CheckIcon /> : <ClipboardCopyIcon />}
                  Copiar lista
                </Button>
              )}
            </div>
            {recall.customers.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
                Nenhum lote afetado foi expedido: não há clientes a contatar.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {recall.customers.map((row) => {
                  const { customer } = row;
                  const place = [customer.city, customer.state].filter(Boolean).join('/');
                  return (
                    <li key={customer.id} className="space-y-3 rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          {place && <div className="text-xs text-muted-foreground">{place}</div>}
                        </div>
                        <span className="text-sm">
                          <UnitQuantities items={row.quantities} />
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {customer.email ? (
                          <a
                            href={`mailto:${customer.email}?subject=${encodeURIComponent(`Recall ${recall.number}`)}`}
                            className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                          >
                            <MailIcon className="size-3.5" aria-hidden />
                            {customer.email}
                          </a>
                        ) : null}
                        {customer.phone ? (
                          <a
                            href={`tel:${customer.phone}`}
                            className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                          >
                            <PhoneIcon className="size-3.5" aria-hidden />
                            {formatPhone(customer.phone)}
                          </a>
                        ) : null}
                        {!customer.email && !customer.phone && (
                          <span className="text-muted-foreground">Sem contato cadastrado</span>
                        )}
                      </div>
                      <ul className="space-y-1 border-t pt-2 text-xs">
                        {row.shipmentNumbers.map((number) => {
                          const shipment = shipments.get(number);
                          return (
                            <li key={number} className="flex flex-wrap gap-x-2">
                              {shipment ? (
                                <Link
                                  to={`/expedicao/${shipment.shipmentId}`}
                                  className="font-mono text-primary underline-offset-4 hover:underline"
                                >
                                  {number}
                                </Link>
                              ) : (
                                <span className="font-mono">{number}</span>
                              )}
                              {shipment && (
                                <span className="text-muted-foreground">
                                  {formatDateTime(shipment.shippedAt)} · {shipment.lotCode} ·{' '}
                                  {formatQuantity(shipment.quantity, shipment.unit)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        {/* Lateral: andamento das etapas, visível enquanto se rola a página. */}
        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Etapas</CardTitle>
            <CardDescription>
              {recall.orchestration === 'STEP_FUNCTIONS'
                ? 'Orquestrado pelo AWS Step Functions.'
                : 'Executado pela própria API.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StepsTimeline steps={recall.steps} />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lotes afetados</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">Lotes afetados pelo recall {recall.number}</caption>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Lote</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Status anterior → atual</TableHead>
                <TableHead>Bloqueado em</TableHead>
                <TableHead className="text-right">Saldo na abertura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recall.lots.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell>
                    <Link
                      to={`/lotes/${lot.id}`}
                      className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {lot.code}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex min-w-40 flex-col gap-1">
                      <span className="font-medium">{lot.product.name}</span>
                      <ProductTypeBadge type={lot.product.type} />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lot.depth === 0 ? 'Origem' : `${lot.depth}º derivado`}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {lot.previousStatus ? (
                        <LotStatusBadge status={lot.previousStatus} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <span aria-label="para" className="text-muted-foreground">
                        →
                      </span>
                      <LotStatusBadge status={lot.status} />
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {lot.blockedAt ? (
                      formatDateTime(lot.blockedAt)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Quantity value={lot.balance} unit={lot.unit} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          Encerrar o recall não libera os lotes: a volta a Disponível é feita lote a lote (Alterar
          status), depois de encerrado.
        </p>
      </section>

      <ConfirmDialog
        open={dialog === 'retry'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Tentar de novo o recall ${recall.number}?`}
        description="O workflow retoma a partir da etapa que falhou. Etapas concluídas não são refeitas."
        confirmLabel="Tentar de novo"
        pending={retry.isPending}
        onConfirm={() => retry.mutate()}
      />
      {dialog === 'close' && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={`Encerrar o recall ${recall.number}?`}
          description="Registre o que foi feito (clientes contatados, destino do estoque). Os lotes continuam bloqueados."
          confirmLabel="Encerrar recall"
          fieldLabel="Notas de encerramento"
          minLength={5}
          maxLength={2000}
          pending={close.isPending}
          error={close.error}
          onSubmit={(notes) => close.mutate(notes)}
          reasonPlaceholder="Clientes contatados; estoque recolhido e destinado à destruição"
        />
      )}
    </div>
  );
}

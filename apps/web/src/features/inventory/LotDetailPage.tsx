import { EmptyState } from '@/components/EmptyState';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  ClipboardPlusIcon,
  GitForkIcon,
  PencilIcon,
  ShieldAlertIcon,
  Undo2Icon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useInventoryPermissions, useQualityPermissions } from '@/auth/permissions';
import { OpenNcDialog } from '@/features/quality/OpenNcDialog';
import { OpenNcAlert } from '@/features/quality/OpenNcAlert';
import { LotStatusAlert } from './LotStatusAlert';
import { DataTable } from '@/components/catalog/DataTable';
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
import { LOCATION_TYPE_LABELS } from '@/features/locations/api';
import { ROAST_LEVEL_LABELS } from '@/features/products/labels';
import { daysUntil, formatDate, formatDateTime, formatQuantity } from '@/lib/quantity';
import { inventoryApi, type LotDetail, type Movement } from './api';
import { AttachmentsCard } from './AttachmentsCard';
import { ExpiryText, LotStatusBadge, Quantity } from './components';
import { EditLotDialog } from './EditLotDialog';
import { LabelButton } from './LabelDialog';
import { MoveLotDialog } from './MoveLotDialog';
import { movementColumns } from './movement-columns';
import { ChangeStatusDialog, ReverseMovementDialog } from './ReasonDialogs';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';
import { countOf } from '@/lib/plural';

/** O histórico mostra as 100 movimentações mais recentes do lote. */
const HISTORY_SIZE = 100;

type DialogState =
  | { kind: 'move' }
  | { kind: 'status' }
  | { kind: 'edit' }
  | { kind: 'nc' }
  | { kind: 'reverse'; movement: Movement }
  | null;

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

const num = (value: number | null, suffix = '') =>
  value === null ? null : `${value.toLocaleString('pt-BR')}${suffix}`;

/** Número gerado pela API para ordens de produção (OP-AAAA-NNNNNN). */
const ORDER_NUMBER = /^OP-d{4}-d{6}$/;

/** Produção, ou consumo lançado por uma ordem: a API recusa o estorno avulso (cancele a ordem). */
function partOfOrder(movement: Movement): boolean {
  return (
    movement.type === 'PRODUCTION' ||
    (movement.type === 'CONSUMPTION' && ORDER_NUMBER.test(movement.documentRef ?? ''))
  );
}

export function LotDetailPage() {
  const { id = '' } = useParams();
  const permissions = useInventoryPermissions();
  const { canOpenNc } = useQualityPermissions();
  const [dialog, setDialog] = useState<DialogState>(null);

  const lotQuery = useQuery({
    queryKey: ['lots', 'detail', id],
    queryFn: ({ signal }) => inventoryApi.getLot(id, signal),
  });
  const history = useQuery({
    queryKey: ['movements', 'lot', id],
    queryFn: ({ signal }) =>
      inventoryApi.listMovements({ lotId: id, pageSize: HISTORY_SIZE }, signal),
  });

  const crumbs = [{ label: 'Lotes', to: '/lotes' }, { label: lotQuery.data?.code ?? 'Lote' }];

  if (lotQuery.isPending) return <DetailPageSkeleton breadcrumbs={crumbs} />;

  if (lotQuery.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={lotQuery.error}
        onRetry={() => void lotQuery.refetch()}
        entity="Lote"
        backTo="/lotes"
        backLabel="Ver lotes"
      />
    );
  }

  const lot: LotDetail = lotQuery.data;
  const consumed = lot.status === 'CONSUMED';
  // Lote bloqueado: a API recusa qualquer saída; só ajuste de sobra seria aceito, então a ação
  // fica desativada com a explicação no aviso de status (estornos seguem pelo histórico).
  const blocked = lot.status === 'BLOCKED';
  const canChangeStatus =
    !consumed && permissions.settableStatuses.some((status) => status !== lot.status);
  const expiryDays = lot.expiresAt ? daysUntil(lot.expiresAt) : null;

  const columns = movementColumns({ unit: lot.unit });
  const rowActions = permissions.canReverse
    ? (movement: Movement) =>
        // Produção e consumo de uma ordem só se desfazem cancelando a ordem (tela da ordem).
        movement.type !== 'REVERSAL' && !partOfOrder(movement) && !movement.reversedById ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDialog({ kind: 'reverse', movement })}
          >
            <Undo2Icon />
            Estornar
          </Button>
        ) : null
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={lot.code}
        documentTitle={`Lote ${lot.code}`}
        breadcrumbs={crumbs}
        badges={<LotStatusBadge status={lot.status} className="h-6 px-2.5 text-sm" />}
        description={
          <>
            <span className="font-medium text-foreground">{lot.product.name}</span> ·{' '}
            {lot.product.sku}
            {lot.supplier && (
              <>
                {' '}
                · {lot.supplier.name}
                {lot.supplier.farmName && ` (${lot.supplier.farmName})`}
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/lotes/${lot.id}/rastreabilidade`}>
                <GitForkIcon />
                Rastreabilidade
              </Link>
            </Button>
            {permissions.canOperate && <LabelButton lot={lot} />}
            {canOpenNc && (
              <Button variant="outline" onClick={() => setDialog({ kind: 'nc' })}>
                <ClipboardPlusIcon />
                Abrir não conformidade
              </Button>
            )}
            {permissions.canOperate && (
              <Button variant="outline" onClick={() => setDialog({ kind: 'edit' })}>
                <PencilIcon />
                Editar dados
              </Button>
            )}
            {canChangeStatus && (
              <Button variant="outline" onClick={() => setDialog({ kind: 'status' })}>
                <ShieldAlertIcon />
                Alterar status
              </Button>
            )}
            {permissions.canOperate && (
              <Button
                onClick={() => setDialog({ kind: 'move' })}
                disabled={blocked || (consumed && !permissions.canAdjust)}
                title={blocked ? 'Lote bloqueado: movimentações suspensas' : undefined}
              >
                <ArrowLeftRightIcon />
                Movimentar
              </Button>
            )}
          </>
        }
      />

      <LotStatusAlert status={lot.status} />
      <OpenNcAlert lotId={lot.id} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Saldo atual</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatQuantity(lot.balance, lot.unit)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3">
              <InfoItem label="Quantidade inicial">
                <Quantity value={lot.initialQuantity} unit={lot.unit} />
              </InfoItem>
              <InfoItem label="Recebido em">{formatDateTime(lot.receivedAt)}</InfoItem>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Validade</CardDescription>
            <CardTitle className="text-3xl">
              {lot.expiresAt ? <ExpiryText value={lot.expiresAt} /> : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {expiryDays === null
              ? 'Sem validade informada.'
              : expiryDays < 0
                ? `Vencido há ${countOf(-expiryDays, 'dia', 'dias')}.`
                : expiryDays === 0
                  ? 'Vence hoje.'
                  : `Vence em ${countOf(expiryDays, 'dia', 'dias')} — ${formatDate(lot.expiresAt)}.`}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Qualidade</CardDescription>
            <CardTitle>{lot.variety ?? 'Variedade não informada'}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3">
              <InfoItem label="Safra">{lot.harvest}</InfoItem>
              <InfoItem label="Altitude">{num(lot.altitudeMeters, ' m')}</InfoItem>
              <InfoItem label="Peneira">{num(lot.screenSize)}</InfoItem>
              <InfoItem label="Umidade">{num(lot.moisturePercent, '%')}</InfoItem>
              <InfoItem label="Torra">
                {lot.roastLevel ? ROAST_LEVEL_LABELS[lot.roastLevel] : null}
              </InfoItem>
              <InfoItem label="Pontuação SCA">{num(lot.cuppingScore)}</InfoItem>
            </dl>
            {lot.notes && (
              <p className="mt-3 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">
                {lot.notes}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Saldo por local</CardTitle>
            <CardDescription>Só locais com saldo.</CardDescription>
          </CardHeader>
          <CardContent>
            {lot.stock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Lote sem saldo em estoque.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Local</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lot.stock.map((row) => (
                    <TableRow key={row.location.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{row.location.code}</span>{' '}
                        <span className="text-muted-foreground">{row.location.name}</span>
                      </TableCell>
                      <TableCell>{LOCATION_TYPE_LABELS[row.location.type]}</TableCell>
                      <TableCell className="text-right">
                        <Quantity value={row.quantity} unit={lot.unit} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AttachmentsCard
          lotId={lot.id}
          canUpload={permissions.canOperate}
          canRemove={permissions.canReverse}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-lg font-semibold">Histórico de movimentações</h2>
          <Link
            to={`/movimentacoes?lotId=${lot.id}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Ver em Movimentações
          </Link>
        </div>
        <DataTable
          caption={`Movimentações do lote ${lot.code}`}
          columns={columns}
          rows={history.data?.data}
          isLoading={history.isPending}
          error={history.isError ? history.error : null}
          onRetry={() => void history.refetch()}
          sort=""
          onSortChange={() => undefined}
          empty={<EmptyState>Nenhuma movimentação.</EmptyState>}
          isMuted={(movement) => movement.reversedById !== null}
          {...(rowActions && { rowActions })}
        />
        {history.data && history.data.meta.total > HISTORY_SIZE && (
          <p className="text-xs text-muted-foreground">
            Mostrando as {HISTORY_SIZE} mais recentes de {history.data.meta.total}.
          </p>
        )}
      </section>

      {dialog?.kind === 'move' && (
        <MoveLotDialog lot={lot} open onOpenChange={(open) => !open && setDialog(null)} />
      )}
      {dialog?.kind === 'status' && (
        <ChangeStatusDialog
          lot={lot}
          statuses={permissions.settableStatuses}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'edit' && <EditLotDialog lot={lot} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'nc' && <OpenNcDialog lot={lot} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reverse' && (
        <ReverseMovementDialog
          movement={dialog.movement}
          lot={lot}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

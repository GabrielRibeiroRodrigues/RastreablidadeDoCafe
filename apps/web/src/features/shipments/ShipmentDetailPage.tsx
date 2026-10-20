import { useQuery } from '@tanstack/react-query';
import { BanIcon, InfoIcon, Undo2Icon, UserIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { useInventoryPermissions } from '@/auth/permissions';
import { CancellationAlert, CancelOperationDialog } from '@/features/inventory/CancelOperation';
import { LotStatusBadge, Quantity } from '@/features/inventory/components';
import { ProductTypeBadge } from '@/features/production/components';
import { formatDocument } from '@/lib/br';
import { formatDateTime } from '@/lib/quantity';
import { shipmentsApi } from './api';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';

export function ShipmentDetailPage() {
  const { id = '' } = useParams();
  const { canReverse } = useInventoryPermissions();
  const [cancelling, setCancelling] = useState(false);
  const query = useQuery({
    queryKey: ['shipments', 'detail', id],
    queryFn: ({ signal }) => shipmentsApi.get(id, signal),
  });

  const crumbs = [
    { label: 'Expedição', to: '/expedicao' },
    { label: query.data?.number ?? 'Expedição' },
  ];

  if (query.isPending) return <DetailPageSkeleton breadcrumbs={crumbs} cards={2} />;

  if (query.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={query.error}
        onRetry={() => void query.refetch()}
        entity="Expedição"
        backTo="/expedicao"
        backLabel="Ver expedições"
      />
    );
  }

  const shipment = query.data;
  const { customer } = shipment;
  const place = [customer.city, customer.state].filter(Boolean).join('/');
  const pendingItems = shipment.items.filter((item) => !item.reversal).length;
  const canCancel = canReverse && !shipment.cancellation && pendingItems > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={shipment.number}
        documentTitle={`Expedição ${shipment.number}`}
        breadcrumbs={crumbs}
        badges={
          shipment.cancellation ? (
            <Badge variant="destructive">Cancelada</Badge>
          ) : pendingItems < shipment.items.length ? (
            <Badge variant="outline">Estorno parcial</Badge>
          ) : null
        }
        actions={
          canCancel && (
            <Button variant="outline" onClick={() => setCancelling(true)}>
              <BanIcon aria-hidden />
              Cancelar expedição
            </Button>
          )
        }
        description={
          <>
            {formatDateTime(shipment.shippedAt)} · por{' '}
            <span className="font-medium text-foreground">{shipment.user.name}</span>
            {shipment.orderRef && <> · {shipment.orderRef}</>}
          </>
        }
      />

      {shipment.cancellation && (
        <CancellationAlert cancellation={shipment.cancellation}>
          <p>As saídas foram estornadas: o café voltou aos locais de origem.</p>
        </CancellationAlert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <UserIcon className="size-3.5" aria-hidden />
              Cliente
            </CardDescription>
            <CardTitle className="text-lg">{customer.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {customer.document && <p>{formatDocument(customer.document)}</p>}
            {place && <p>{place}</p>}
            <Link
              to={`/expedicao?customerId=${customer.id}`}
              className="inline-block pt-1 text-primary underline-offset-4 hover:underline"
            >
              Outras expedições deste cliente
            </Link>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Pedido / NF</CardDescription>
            <CardTitle className="text-lg">{shipment.orderRef ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-line text-muted-foreground">
            {shipment.notes ?? 'Sem observações.'}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Itens</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">Itens da expedição {shipment.number}</caption>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Lote</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Status do lote</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipment.items.map((item) => (
                <TableRow
                  key={item.movementId}
                  className={item.reversal ? 'text-muted-foreground opacity-70' : undefined}
                >
                  <TableCell>
                    <Link
                      to={`/lotes/${item.lot.id}`}
                      className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {item.lot.code}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex min-w-40 flex-col gap-1">
                      <span className="font-medium">{item.product.name}</span>
                      <ProductTypeBadge type={item.product.type} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{item.location.code}</span>
                    <div className="text-xs text-muted-foreground">{item.location.name}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <LotStatusBadge status={item.lot.status} />
                      {item.reversal && (
                        <Badge variant="outline" className="text-muted-foreground">
                          <Undo2Icon aria-hidden />
                          Estornado
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Quantity value={item.quantity} unit={item.unit} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {!shipment.cancellation && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Expedições não são editadas. Para corrigir um item (quantidade errada, devolução
            parcial), um administrador estorna a saída no histórico do lote; para desfazer a
            expedição inteira, use “Cancelar expedição”. Itens estornados não contam como entregues
            no rastreio nem no recall.
          </AlertDescription>
        </Alert>
      )}

      {cancelling && (
        <CancelOperationDialog
          title={`Cancelar a expedição ${shipment.number}?`}
          description={
            <>
              {pendingItems === 1
                ? 'A saída do item será estornada'
                : `As saídas de ${pendingItems} itens serão estornadas`}{' '}
              e o café volta aos locais de origem. A expedição fica no histórico, marcada como
              cancelada.
            </>
          }
          successMessage={`Expedição ${shipment.number} cancelada`}
          reasonPlaceholder="Pedido cancelado pelo cliente"
          cancel={(reason) => shipmentsApi.cancel(shipment.id, reason)}
          onClose={() => setCancelling(false)}
        />
      )}
    </div>
  );
}

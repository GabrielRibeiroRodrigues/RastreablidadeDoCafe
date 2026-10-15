import { useQuery } from '@tanstack/react-query';
import { InfoIcon, UserIcon } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { ProductTypeBadge } from '@/features/production/components';
import { formatDocument } from '@/lib/br';
import { formatDateTime } from '@/lib/quantity';
import { shipmentsApi } from './api';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';

export function ShipmentDetailPage() {
  const { id = '' } = useParams();
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

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={shipment.number}
        documentTitle={`Expedição ${shipment.number}`}
        breadcrumbs={crumbs}
        description={
          <>
            {formatDateTime(shipment.shippedAt)} · por{' '}
            <span className="font-medium text-foreground">{shipment.user.name}</span>
            {shipment.orderRef && <> · {shipment.orderRef}</>}
          </>
        }
      />

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
                <TableRow key={item.movementId}>
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
                    <LotStatusBadge status={item.lot.status} />
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

      <Alert>
        <InfoIcon />
        <AlertDescription>
          Expedições não são editadas nem canceladas. Para corrigir um item (quantidade errada,
          devolução), um administrador estorna a saída no histórico do lote — abra o lote pelo link
          na tabela. O estorno mantém o número {shipment.number} como documento.
        </AlertDescription>
      </Alert>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, GitForkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
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
import { formatDateTime } from '@/lib/quantity';
import { productionApi } from './api';
import { KgText, ProductTypeBadge, StageBadge, YieldText } from './components';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

export function ProductionOrderDetailPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['production-orders', 'detail', id],
    queryFn: ({ signal }) => productionApi.get(id, signal),
  });

  const crumbs = [{ label: 'Produção', to: '/producao' }, { label: query.data?.number ?? 'Ordem' }];

  if (query.isPending) return <DetailPageSkeleton breadcrumbs={crumbs} cards={2} />;

  if (query.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={query.error}
        onRetry={() => void query.refetch()}
        entity="Ordem de produção"
        backTo="/producao"
        backLabel="Ver ordens"
      />
    );
  }

  const order = query.data;
  const { output } = order;

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={order.number}
        documentTitle={`Ordem ${order.number}`}
        breadcrumbs={crumbs}
        badges={<StageBadge stage={order.stage} className="h-6 px-2.5 text-sm" />}
        description={
          <>
            {formatDateTime(order.performedAt)} · por{' '}
            <span className="font-medium text-foreground">{order.user.name}</span>
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <Link to={`/lotes/${output.id}/rastreabilidade`}>
              <GitForkIcon />
              Rastreabilidade do lote gerado
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Balanço de massa</CardTitle>
            <CardDescription>
              Em kg (1 saca = 60 kg). Embalagens e quantidades em unidades ficam fora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Entrada">
                <KgText value={order.inputMassKg} />
              </Metric>
              <Metric label="Saída">
                <KgText value={order.outputMassKg} />
              </Metric>
              <Metric label="Rendimento">
                <YieldText value={order.yieldPercent} stage={order.stage} />
              </Metric>
              <Metric label="Perda">
                <KgText value={order.lossKg} />
              </Metric>
            </dl>
            {order.notes && (
              <p className="mt-4 border-t pt-4 text-sm whitespace-pre-line text-muted-foreground">
                {order.notes}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardDescription>Lote gerado</CardDescription>
            <CardTitle>
              <Link
                to={`/lotes/${output.id}`}
                className="font-mono text-xl text-primary underline-offset-4 hover:underline"
              >
                {output.code}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProductTypeBadge type={output.product.type} />
              <LotStatusBadge status={output.status} />
            </div>
            <p className="text-sm">
              <span className="font-medium">{output.product.name}</span>{' '}
              <span className="text-muted-foreground">· {output.product.sku}</span>
            </p>
            <p className="text-2xl font-semibold">
              <Quantity value={output.quantity} unit={output.unit} />
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Insumos consumidos</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">Insumos da ordem {order.number}</caption>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Lote</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="w-px">
                  <span className="sr-only">Gerou</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.inputs.map((input) => (
                <TableRow key={input.id}>
                  <TableCell>
                    <Link
                      to={`/lotes/${input.id}`}
                      className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {input.code}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="min-w-40">
                      <div className="font-medium">{input.product.name}</div>
                      <div className="text-xs text-muted-foreground">{input.product.sku}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ProductTypeBadge type={input.product.type} />
                  </TableCell>
                  <TableCell>
                    <LotStatusBadge status={input.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Quantity value={input.quantity} unit={input.unit} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-mono text-xs">
                      <ArrowRightIcon className="size-3.5" aria-hidden />
                      {output.code}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Ordens não são editadas: para corrigir, estorne as movimentações de consumo e de produção
          nos lotes.
        </p>
      </section>
    </div>
  );
}

import { AlertTriangleIcon, BoxesIcon, PackageIcon, TruckIcon, UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { SUPPLIER_TYPE_LABELS } from '@/features/suppliers/api';
import { countOf } from '@/lib/plural';
import { formatDateTime, formatQuantity, toMilli } from '@/lib/quantity';
import type { RecallSimulation } from './api';
import { UnitQuantities } from './components';

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BoxesIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="px-4 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

/** Resultado de `POST /v1/recalls/simulate`: totais, lotes, clientes e fazendas de origem. */
export function ImpactView({
  impact,
  simulatedAt,
}: {
  impact: RecallSimulation;
  simulatedAt: Date;
}) {
  const { totals } = impact;
  // Itens estornados não foram entregues: o detalhe dos clientes usa só o que saiu de fato.
  const shipmentsByNumber = new Map(
    impact.shipments.filter((s) => !s.reversed).map((s) => [s.number, s]),
  );

  return (
    <div className="space-y-6">
      {impact.truncated && (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Grafo truncado</AlertTitle>
          <AlertDescription>
            A rastreabilidade passou do limite de profundidade: pode haver lotes e clientes além dos
            listados. Confira na tela de rastreabilidade.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={BoxesIcon}
          label="Lotes afetados"
          value={totals.lots}
          hint={`${totals.lotsWithStock} com saldo em estoque`}
        />
        <Stat
          icon={PackageIcon}
          label="Saldo a bloquear"
          value={<UnitQuantities items={totals.stock} />}
          hint="Soma do saldo atual dos lotes afetados"
        />
        <Stat
          icon={TruckIcon}
          label="Já expedido"
          value={<UnitQuantities items={totals.shipped} />}
          hint={countOf(totals.shipments, 'expedição', 'expedições')}
        />
        <Stat
          icon={UsersIcon}
          label="Clientes a contatar"
          value={totals.customers}
          hint={totals.customers === 0 ? 'Nada saiu da empresa' : 'Receberam produto afetado'}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lotes afetados</h2>
        <p className="text-sm text-muted-foreground">
          O lote de origem e todos os derivados (torrado, blend, embalado). Ao executar, todos
          passam a <strong className="font-medium text-foreground">Bloqueado</strong>.
        </p>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">Lotes afetados</caption>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Lote</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Status atual</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {impact.lots.map((lot) => (
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
                    <LotStatusBadge status={lot.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={toMilli(lot.balance) === 0n ? 'text-muted-foreground' : ''}>
                      <Quantity value={lot.balance} unit={lot.unit} />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clientes a contatar</h2>
        {impact.customers.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
            Nenhuma expedição de lote afetado: nenhum cliente precisa ser contatado.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Clientes a contatar</caption>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Expedições</TableHead>
                  <TableHead className="text-right">Quantidade recebida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {impact.customers.map((row) => (
                  <TableRow key={row.customer.id}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{row.customer.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[row.customer.city, row.customer.state].filter(Boolean).join('/') || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ul className="space-y-0.5 text-xs">
                        {row.shipmentNumbers.map((number) => {
                          const shipment = shipmentsByNumber.get(number);
                          return (
                            <li key={number}>
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
                                  {' '}
                                  · {formatDateTime(shipment.shippedAt)} · {shipment.lotCode} ·{' '}
                                  {formatQuantity(shipment.quantity, shipment.unit)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </TableCell>
                    <TableCell className="text-right">
                      <UnitQuantities items={row.quantities} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fazendas de origem</h2>
        {impact.origins.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem fornecedor registrado na origem.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {impact.origins.map((origin) => (
              <li key={origin.id} className="rounded-xl border bg-card p-4 text-sm">
                <div className="font-medium">{origin.farmName ?? origin.name}</div>
                <div className="text-xs text-muted-foreground">
                  {origin.farmName ? `${origin.name} · ` : ''}
                  {SUPPLIER_TYPE_LABELS[origin.type]}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[origin.region, [origin.city, origin.state].filter(Boolean).join('/')]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                  {origin.altitudeMeters !== null &&
                    ` · ${origin.altitudeMeters.toLocaleString('pt-BR')} m`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Simulação em {formatDateTime(simulatedAt.toISOString())}: os números podem mudar até a
        execução (novas expedições ou movimentações). Ao executar, a API calcula de novo.
      </p>
    </div>
  );
}

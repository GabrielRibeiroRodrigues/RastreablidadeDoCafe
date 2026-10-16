import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  DownloadIcon,
  FactoryIcon,
  LayersIcon,
  Loader2Icon,
  TriangleAlertIcon,
  TruckIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PeriodFilter } from '@/components/catalog/PeriodFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useLocations, useProducts } from '@/features/inventory/hooks';
import { LOT_STATUS_LABELS, MOVEMENT_TYPE_LABELS } from '@/features/inventory/labels';
import { STAGE_LABELS } from '@/features/production/labels';
import { PRODUCT_TYPE_LABELS } from '@/features/products/labels';
import { getErrorMessage } from '@/lib/api';
import { getApiClient, unwrap } from '@/lib/api-client';
import { downloadFromApi, type DownloadResult } from '@/lib/download';
import { toOptions } from '@/lib/options';
import { startOfLocalDayIso } from '@/lib/quantity';

type Filters = Record<string, string | undefined>;

/** `from`/`to` em dias locais → ISO (`to` inclui o dia: a API trata `to` como exclusivo). */
function periodQuery(filters: Filters): Filters {
  const { from, to, ...rest } = filters;
  return {
    ...rest,
    ...(from ? { from: startOfLocalDayIso(from) } : {}),
    ...(to ? { to: startOfLocalDayIso(to, 1) } : {}),
  };
}

function ReportCard({
  icon: Icon,
  title,
  description,
  path,
  fallbackName,
  filters,
  children,
  usesPeriod,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  path: string;
  fallbackName: string;
  filters: Filters;
  children: ReactNode;
  usesPeriod?: boolean;
}) {
  const [last, setLast] = useState<DownloadResult | null>(null);
  const download = useMutation({
    mutationFn: () =>
      downloadFromApi(path, usesPeriod ? periodQuery(filters) : filters, fallbackName),
    onSuccess: (result) => {
      setLast(result);
      if (result.truncated) {
        toast.warning('Relatório cortado no limite de linhas', {
          description: 'Filtre por um período menor para obter todas as linhas.',
        });
      } else {
        toast.success('Relatório baixado', { description: result.fileName });
      }
    },
    onError: (error) =>
      toast.error('Não foi possível baixar o relatório', { description: getErrorMessage(error) }),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>
        {last?.truncated && (
          <Alert>
            <TriangleAlertIcon />
            <AlertDescription>
              O último arquivo foi cortado em {last.rows?.toLocaleString('pt-BR') ?? '20.000'}{' '}
              linhas (limite por arquivo). Filtre por um período menor.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {last && !last.truncated && last.rows !== null
            ? `${last.rows.toLocaleString('pt-BR')} linha(s) no último arquivo`
            : 'CSV para Excel (separador ";")'}
        </span>
        <Button onClick={() => download.mutate()} disabled={download.isPending}>
          {download.isPending ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <DownloadIcon />
          )}
          Baixar CSV
        </Button>
      </CardFooter>
    </Card>
  );
}

function useCustomerOptions() {
  return useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: ({ signal }) =>
      unwrap(
        getApiClient().GET('/v1/customers', {
          params: { query: { status: 'all', pageSize: 100, sort: 'name' } },
          signal,
        }),
      ),
    staleTime: 60_000,
  });
}

/** Planilhas CSV (todos os perfis). Filtros ficam no estado local de cada cartão. */
export function ReportsPage() {
  const products = useProducts();
  const locations = useLocations('all');
  const customers = useCustomerOptions();
  const [stock, setStock] = useState<Filters>({});
  const [movements, setMovements] = useState<Filters>({});
  const [production, setProduction] = useState<Filters>({});
  const [shipments, setShipments] = useState<Filters>({});

  const set =
    (setter: (update: (current: Filters) => Filters) => void) =>
    (name: string, value: string | null) =>
      setter((current) => ({ ...current, [name]: value ?? undefined }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Relatórios' }]}
        description="Planilhas CSV prontas para o Excel em português (separador ponto e vírgula, vírgula decimal). Até 20.000 linhas por arquivo."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          icon={LayersIcon}
          title="Estoque"
          description="Saldo atual por lote e local, com produto, validade e status."
          path="/v1/reports/stock.csv"
          fallbackName="estoque.csv"
          filters={stock}
        >
          <FilterSelect
            label="Produto"
            allLabel="Todos os produtos"
            options={(products.data?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={stock.productId}
            onChange={(value) => set(setStock)('productId', value)}
          />
          <FilterSelect
            label="Tipo de produto"
            allLabel="Todos os tipos"
            options={toOptions(PRODUCT_TYPE_LABELS)}
            value={stock.productType}
            onChange={(value) => set(setStock)('productType', value)}
          />
          <FilterSelect
            label="Local"
            allLabel="Todos os locais"
            options={(locations.data?.data ?? []).map((l) => ({
              value: l.id,
              label: `${l.code} · ${l.name}`,
            }))}
            value={stock.locationId}
            onChange={(value) => set(setStock)('locationId', value)}
          />
          <FilterSelect
            label="Status do lote"
            allLabel="Todos os status"
            options={toOptions(LOT_STATUS_LABELS)}
            value={stock.lotStatus}
            onChange={(value) => set(setStock)('lotStatus', value)}
          />
        </ReportCard>

        <ReportCard
          icon={ArrowLeftRightIcon}
          title="Movimentações"
          description="Razão em ordem cronológica: tipo, lote, origem, destino, quantidade, documento e usuário."
          path="/v1/reports/movements.csv"
          fallbackName="movimentacoes.csv"
          filters={movements}
          usesPeriod
        >
          <FilterSelect
            label="Tipo"
            allLabel="Todos os tipos"
            options={toOptions(MOVEMENT_TYPE_LABELS)}
            value={movements.type}
            onChange={(value) => set(setMovements)('type', value)}
          />
          <PeriodFilter
            from={movements.from}
            to={movements.to}
            onChange={(name, value) => set(setMovements)(name, value)}
          />
        </ReportCard>

        <ReportCard
          icon={FactoryIcon}
          title="Produção"
          description="Ordens com insumos, massa de entrada e saída, rendimento e perda."
          path="/v1/reports/production.csv"
          fallbackName="producao.csv"
          filters={production}
          usesPeriod
        >
          <FilterSelect
            label="Etapa"
            allLabel="Todas as etapas"
            options={toOptions(STAGE_LABELS)}
            value={production.stage}
            onChange={(value) => set(setProduction)('stage', value)}
          />
          <PeriodFilter
            from={production.from}
            to={production.to}
            onChange={(name, value) => set(setProduction)(name, value)}
          />
        </ReportCard>

        <ReportCard
          icon={TruckIcon}
          title="Expedições"
          description="Uma linha por item expedido: cliente, documento, cidade/UF, lote e quantidade."
          path="/v1/reports/shipments.csv"
          fallbackName="expedicoes.csv"
          filters={shipments}
          usesPeriod
        >
          <FilterSelect
            label="Cliente"
            allLabel="Todos os clientes"
            options={(customers.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={shipments.customerId}
            onChange={(value) => set(setShipments)('customerId', value)}
          />
          <PeriodFilter
            from={shipments.from}
            to={shipments.to}
            onChange={(name, value) => set(setShipments)(name, value)}
          />
        </ReportCard>
      </div>
    </div>
  );
}

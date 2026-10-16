import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, GitForkIcon, SearchIcon, SearchXIcon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { inventoryApi } from '@/features/inventory/api';
import { LotStatusBadge } from '@/features/inventory/components';
import { ProductTypeBadge } from '@/features/production/components';
import { Skeleton } from '@/components/ui/skeleton';
import { countOf } from '@/lib/plural';

/** Busca de lote pelo código; leva à árvore de rastreabilidade. */
export function TraceSearchPage() {
  const inputId = useId();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  const results = useQuery({
    queryKey: ['lots', 'trace-search', q],
    queryFn: ({ signal }) =>
      inventoryApi.listLots({ q, pageSize: 10, sort: '-receivedAt' }, signal),
    enabled: q !== '',
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const code = text.trim().toUpperCase();
    if (!code) return;
    setQ(code);
  };

  // Código exato: vai direto para a árvore.
  const exact = results.data?.data.find((lot) => lot.code === q);
  if (exact) return <Navigate to={`/lotes/${exact.id}/rastreabilidade`} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rastreabilidade"
        breadcrumbs={[{ label: 'Estoque' }, { label: 'Rastreabilidade' }]}
        description="Do café na xícara até a fazenda, e da fazenda até o cliente. Informe o código do lote (ex.: CAF-2026-000013) ou parte dele."
      />

      <Card>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              Código do lote
            </label>
            <div className="relative flex-1">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={inputId}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="CAF-2026-000013"
                className="pl-8 font-mono"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!text.trim()}>
              <GitForkIcon />
              Rastrear
            </Button>
          </form>
        </CardContent>
      </Card>

      {q !== '' && (
        <section className="space-y-3" aria-live="polite">
          {results.isPending ? (
            <div className="grid gap-2 sm:grid-cols-2" role="status" aria-label="Buscando lotes">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : results.isError ? (
            <ErrorState error={results.error} onRetry={() => void results.refetch()} />
          ) : results.data.data.length === 0 ? (
            <EmptyState
              bordered
              icon={SearchXIcon}
              title="Nenhum lote encontrado"
              description={`Nenhum lote com o código “${q}”. Confira o código impresso na etiqueta.`}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {countOf(results.data.meta.total, 'lote encontrado', 'lotes encontrados')}
                {results.data.meta.total > results.data.data.length &&
                  ` (mostrando ${results.data.data.length})`}
                . Escolha um:
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {results.data.data.map((lot) => (
                  <li key={lot.id}>
                    <Link
                      to={`/lotes/${lot.id}/rastreabilidade`}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{lot.code}</span>
                          <ProductTypeBadge type={lot.product.type} />
                          <LotStatusBadge status={lot.status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{lot.product.name}</p>
                      </div>
                      <ArrowRightIcon
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

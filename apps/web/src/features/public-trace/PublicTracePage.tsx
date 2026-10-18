import { useQuery } from '@tanstack/react-query';
import type { ApiSchema } from '@traceflow/shared';
import { cn } from 'cn';
import {
  CoffeeIcon,
  ExternalLinkIcon,
  FactoryIcon,
  LeafIcon,
  MapPinIcon,
  MountainIcon,
  PackageIcon,
  RefreshCwIcon,
  SearchXIcon,
  SproutIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PRODUCT_TYPE_LABELS, ROAST_LEVEL_LABELS } from '@/features/products/labels';
import { isDarkColor } from '@/lib/color';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/quantity';
import { publicTraceApi, type PublicOrigin, type PublicTrace, type PublicTraceStep } from './api';

type ProductionStage = ApiSchema<'ProductionStage'>;

const STAGES: Record<ProductionStage, { label: string; icon: LucideIcon }> = {
  PROCESSING: { label: 'Beneficiamento', icon: FactoryIcon },
  ROASTING: { label: 'Torra', icon: CoffeeIcon },
  BLENDING: { label: 'Blend', icon: CoffeeIcon },
  PACKAGING: { label: 'Embalagem', icon: PackageIcon },
};

function stepInfo(step: PublicTraceStep): { label: string; icon: LucideIcon } {
  if (step.stage) return STAGES[step.stage];
  return step.productType === 'GREEN'
    ? { label: 'Colheita e recebimento', icon: SproutIcon }
    : { label: 'Recebimento', icon: PackageIcon };
}

const dayFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
const formatDay = (iso: string) => dayFormat.format(new Date(iso));
const score = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function place(origin: PublicOrigin): string {
  const city = [origin.city, origin.state].filter(Boolean).join('/');
  return [origin.region, city].filter(Boolean).join(' · ');
}

/** Página pública do QR code da etiqueta: sem login, pensada primeiro para o celular. */
export function PublicTracePage() {
  const { token = '' } = useParams();
  const query = useQuery({
    queryKey: ['public-trace', token],
    queryFn: ({ signal }) => publicTraceApi.get(token, signal),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <TraceView trace={query.data} />
      )}
      <Footer />
    </div>
  );
}

function TraceView({ trace }: { trace: PublicTrace }) {
  const { lot, brand } = trace;
  // Cor da marca no fundo só quando o texto claro continua legível; senão, vira uma faixa no topo.
  const brandBackground = isDarkColor(brand.color) ? brand.color : null;
  const brandStripe = brand.color && !brandBackground ? brand.color : null;
  const dateLabel =
    lot.productType === 'GREEN'
      ? 'Recebido em'
      : lot.productType === 'ROASTED'
        ? 'Torrado em'
        : 'Produzido em';

  return (
    <>
      <title>{`${lot.productName} · ${lot.code} — TraceFlow`}</title>
      <header
        className="relative overflow-hidden bg-sidebar text-sidebar-foreground"
        style={brandBackground ? { backgroundColor: brandBackground } : undefined}
      >
        {brandStripe && (
          <div aria-hidden className="h-1.5 w-full" style={{ backgroundColor: brandStripe }} />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-sidebar-primary/20 blur-3xl"
        />
        <div className="relative mx-auto max-w-2xl space-y-5 px-4 pt-8 pb-10 sm:px-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.18em] text-sidebar-primary uppercase">
              {trace.companyName}
            </p>
            {brand.tagline && <p className="text-sm text-sidebar-foreground/80">{brand.tagline}</p>}
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sidebar-foreground/80 underline-offset-4 hover:text-sidebar-accent-foreground hover:underline"
              >
                {brand.website.replace(/^https:\/\//, '').replace(/\/$/, '')}
                <ExternalLinkIcon className="size-3" aria-hidden />
              </a>
            )}
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-sidebar-accent-foreground sm:text-4xl">
              {lot.productName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-sidebar-accent px-2.5 py-1 font-mono text-sm text-sidebar-accent-foreground">
                Lote {lot.code}
              </span>
              <span className="rounded-md bg-sidebar-accent px-2.5 py-1 text-sm">
                {PRODUCT_TYPE_LABELS[lot.productType]}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  lot.available
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : 'bg-sidebar-accent text-sidebar-muted',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    lot.available ? 'bg-emerald-300' : 'bg-sidebar-muted',
                  )}
                />
                {lot.available ? 'Disponível' : 'Indisponível'}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-sidebar-border bg-sidebar-border sm:grid-cols-3">
            <Stat label="Torra">{lot.roastLevel ? ROAST_LEVEL_LABELS[lot.roastLevel] : null}</Stat>
            <Stat label={dateLabel}>{formatDay(lot.producedAt)}</Stat>
            <Stat label="Pontuação SCA" highlight>
              {lot.cuppingScore !== null ? score(lot.cuppingScore) : null}
            </Stat>
            <Stat label="Safra">{lot.harvest}</Stat>
            <Stat label="Variedade">{lot.variety}</Stat>
            <Stat label="Validade">{lot.expiresAt ? formatDate(lot.expiresAt) : null}</Stat>
          </dl>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-10 px-4 py-8 sm:px-6">
        <section aria-labelledby="origem" className="space-y-4">
          <SectionTitle id="origem" icon={MapPinIcon}>
            Origem
          </SectionTitle>
          {trace.origins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Origem não informada para este lote.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {trace.origins.map((origin) => (
                <li
                  key={`${origin.name}|${place(origin)}`}
                  className="rounded-xl border bg-card p-4 shadow-xs"
                >
                  <p className="font-semibold">
                    {origin.name ??
                      `Produtor de ${origin.region ?? origin.city ?? 'origem não informada'}`}
                  </p>
                  {place(origin) && (
                    <p className="mt-1 text-sm text-muted-foreground">{place(origin)}</p>
                  )}
                  {origin.altitudeMeters !== null && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      <MountainIcon className="size-3.5" />
                      {origin.altitudeMeters.toLocaleString('pt-BR')} m de altitude
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="caminho" className="space-y-4">
          <SectionTitle id="caminho" icon={LeafIcon}>
            Do grão à xícara
          </SectionTitle>
          <Timeline chain={trace.chain} />
          {trace.truncated && (
            <p className="text-xs text-muted-foreground">
              A cadeia é longa: mostramos as etapas mais próximas deste lote.
            </p>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({
  label,
  children,
  highlight = false,
}: {
  label: string;
  children: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="bg-sidebar px-3.5 py-3">
      <dt className="text-[0.7rem] font-medium tracking-wide text-sidebar-muted uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-0.5 font-semibold text-sidebar-accent-foreground',
          highlight && children !== null && 'text-sidebar-primary',
        )}
      >
        {children ?? <span className="text-sidebar-muted">—</span>}
      </dd>
    </div>
  );
}

function SectionTitle({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      {children}
    </h2>
  );
}

/** Etapas agrupadas por distância: as origens primeiro, o lote consultado por último. */
function Timeline({ chain }: { chain: PublicTraceStep[] }) {
  const groups = new Map<number, PublicTraceStep[]>();
  for (const step of chain) groups.set(step.depth, [...(groups.get(step.depth) ?? []), step]);
  const ordered = [...groups.entries()].sort(([a], [b]) => b - a);

  return (
    <ol className="relative space-y-6 border-l-2 border-dashed border-border pl-6 ml-3.5">
      {ordered.map(([depth, steps]) => {
        const first = steps[0];
        if (!first) return null;
        const { label, icon: Icon } = stepInfo(first);
        const current = depth === 0;
        return (
          <li key={depth} className="relative">
            <span
              className={cn(
                'absolute top-0 -left-[2.4rem] flex size-7 items-center justify-center rounded-full border-2 border-background',
                current ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary',
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm font-semibold">
              {label}
              {current && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">este lote</span>
              )}
            </p>
            <ul className="mt-2 space-y-2">
              {steps.map((step) => (
                <li
                  key={step.code}
                  className={cn(
                    'rounded-lg border bg-card px-3.5 py-2.5 text-sm',
                    current && 'border-primary/40',
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{step.productName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{step.code}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      formatDay(step.date),
                      step.harvest && `Safra ${step.harvest}`,
                      step.variety,
                      step.origin?.name ?? (step.origin ? place(step.origin) : null),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function LoadingState() {
  return (
    <div aria-busy className="flex-1">
      <div className="bg-sidebar">
        <div className="mx-auto max-w-2xl space-y-4 px-4 pt-8 pb-10 sm:px-6">
          <Skeleton className="h-3 w-40 bg-sidebar-accent" />
          <Skeleton className="h-9 w-64 bg-sidebar-accent" />
          <Skeleton className="h-6 w-48 bg-sidebar-accent" />
          <Skeleton className="h-36 w-full bg-sidebar-accent" />
        </div>
      </div>
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-8 sm:px-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  const tooMany = error instanceof ApiError && error.status === 429;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <title>Rastreio — TraceFlow</title>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <SearchXIcon className="size-7" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">
        {notFound ? 'Código de rastreio não encontrado' : 'Não foi possível carregar o rastreio'}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {notFound
          ? 'Confira se o QR code foi lido por inteiro ou digite o endereço impresso na etiqueta.'
          : tooMany
            ? 'Muitas consultas em pouco tempo. Aguarde um minuto e tente novamente.'
            : getErrorMessage(error)}
      </p>
      {!notFound && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCwIcon />
          Tentar novamente
        </Button>
      )}
    </main>
  );
}

function Footer() {
  return (
    <footer className="border-t py-6 text-center text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <CoffeeIcon className="size-3.5 text-primary" />
        Rastreado com <span className="font-semibold text-foreground">TraceFlow</span>
      </span>
    </footer>
  );
}

import { useQuery } from '@tanstack/react-query';
import type { ApiSchema } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Performance = ApiSchema<'PerformanceResponse'>;
export type PerformanceDays = Performance['days'];
export type YieldBucket = Performance['yieldSeries'][number];

export const PERIODS: ReadonlyArray<{ days: PerformanceDays; label: string }> = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 180, label: '6 meses' },
  { days: 365, label: '12 meses' },
];

export function isPeriod(value: number): value is PerformanceDays {
  return PERIODS.some((period) => period.days === value);
}

export function usePerformance(days: PerformanceDays) {
  return useQuery({
    queryKey: ['dashboard', 'performance', days],
    queryFn: ({ signal }) =>
      unwrap(
        getApiClient().GET('/v1/dashboard/performance', { params: { query: { days } }, signal }),
      ),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** Variação contra o período anterior: `null` quando não há base para comparar. */
export function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
const monthYear = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

export function bucketLabel(start: string, bucket: 'week' | 'month'): string {
  const date = new Date(`${start}T00:00:00Z`);
  return bucket === 'week'
    ? `Semana de ${shortDate.format(date)}`
    : monthYear.format(date).replace('.', '');
}

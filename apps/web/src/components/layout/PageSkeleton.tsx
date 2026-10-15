import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto genérico enquanto o código da página é baixado. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando página">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-full max-w-xs" />
        <Skeleton className="h-8 w-44" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

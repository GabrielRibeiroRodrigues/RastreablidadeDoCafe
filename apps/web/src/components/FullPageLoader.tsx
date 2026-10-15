import { Loader2Icon } from 'lucide-react';

export function FullPageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

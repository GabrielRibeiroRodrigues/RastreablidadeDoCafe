import { cn } from 'cn';

/** Logotipo: grão de café estilizado + nome do produto. */
export function BrandMark({
  className,
  inverted = false,
  compact = false,
}: {
  className?: string;
  /** Sobre fundo escuro (barra lateral). */
  inverted?: boolean;
  /** Só o símbolo (barra lateral recolhida). */
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-sidebar-primary" />
        <ellipse
          cx="16"
          cy="16"
          rx="7"
          ry="10"
          transform="rotate(30 16 16)"
          className="fill-sidebar"
        />
        <path
          d="M12.5 9.5c3 3.2 3.4 9.4 7 13"
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="stroke-sidebar-primary"
        />
      </svg>
      <span
        className={cn(
          'text-lg font-semibold tracking-tight',
          inverted ? 'text-sidebar-accent-foreground' : 'text-foreground',
          compact && 'sr-only',
        )}
      >
        TraceFlow
      </span>
    </div>
  );
}

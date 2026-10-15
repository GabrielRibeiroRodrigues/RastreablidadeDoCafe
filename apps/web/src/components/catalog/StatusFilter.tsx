import { cn } from 'cn';
import type { RecordStatus } from './use-list-params';

const OPTIONS: Array<{ value: RecordStatus; label: string }> = [
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'all', label: 'Todos' },
];

/** Controle segmentado Ativos / Inativos / Todos. */
export function StatusFilter({
  value,
  onChange,
}: {
  value: RecordStatus;
  onChange: (value: RecordStatus) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Situação"
      className="inline-flex h-8 shrink-0 items-center rounded-lg bg-muted p-0.5 text-sm"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-full rounded-md px-3 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

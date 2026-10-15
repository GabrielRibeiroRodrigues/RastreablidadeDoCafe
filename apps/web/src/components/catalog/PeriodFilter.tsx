import { useId } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Período em dias locais (`AAAA-MM-DD`), guardado na URL como `from` e `to`. Quem consulta a API
 * converte com `startOfLocalDayIso` ("até" inclui o dia: `to` + 1 dia, exclusivo na API).
 */
export function PeriodFilter({
  from,
  to,
  onChange,
}: {
  from: string | undefined;
  to: string | undefined;
  onChange: (name: 'from' | 'to', value: string | null) => void;
}) {
  const fromId = useId();
  const toId = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={fromId} className="text-sm text-muted-foreground">
        De
      </label>
      <Input
        id={fromId}
        type="date"
        className="w-40"
        value={from ?? ''}
        {...(to && { max: to })}
        onChange={(event) => onChange('from', event.target.value || null)}
      />
      <label htmlFor={toId} className="text-sm text-muted-foreground">
        até
      </label>
      <Input
        id={toId}
        type="date"
        className="w-40"
        value={to ?? ''}
        {...(from && { min: from })}
        onChange={(event) => onChange('to', event.target.value || null)}
      />
    </div>
  );
}

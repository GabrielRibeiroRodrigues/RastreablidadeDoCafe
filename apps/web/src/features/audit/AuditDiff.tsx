import { cn } from 'cn';
import type { AuditLog } from './api';
import { AUDIT_FIELD_LABELS } from './labels';

type Snapshot = AuditLog['before'];

function show(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Antes × depois, campo a campo: os campos alterados ficam em destaque. Sem `before` (criação) ou
 * sem `after`, mostra só o lado que existe.
 */
export function AuditDiff({ before, after }: { before: Snapshot; after: Snapshot }) {
  if (!before && !after) {
    return <p className="text-sm text-muted-foreground">Sem dados registrados nesta entrada.</p>;
  }
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const both = Boolean(before && after);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th className="py-1.5 pr-3 font-medium">Campo</th>
            {before && <th className="py-1.5 pr-3 font-medium">Antes</th>}
            {after && <th className="py-1.5 font-medium">{both ? 'Depois' : 'Dados'}</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const a = before?.[key];
            const b = after?.[key];
            const changed = both && !same(a, b);
            return (
              <tr
                key={key}
                className={cn('border-b align-top last:border-0', changed && 'bg-amber-500/10')}
              >
                <th scope="row" className="py-1.5 pr-3 font-medium whitespace-nowrap">
                  {AUDIT_FIELD_LABELS[key] ?? key}
                  {changed && (
                    <span className="ml-1.5 rounded bg-amber-500/20 px-1 text-[0.625rem] text-amber-800 uppercase dark:text-amber-300">
                      alterado
                    </span>
                  )}
                </th>
                {before && (
                  <td
                    className={cn(
                      'py-1.5 pr-3 font-mono break-all whitespace-pre-wrap',
                      changed && 'text-destructive line-through decoration-destructive/40',
                    )}
                  >
                    {show(a)}
                  </td>
                )}
                {after && (
                  <td
                    className={cn(
                      'py-1.5 font-mono break-all whitespace-pre-wrap',
                      changed && 'font-semibold text-emerald-700 dark:text-emerald-400',
                    )}
                  >
                    {show(b)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

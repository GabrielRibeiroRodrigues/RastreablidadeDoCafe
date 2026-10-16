import { useQuery } from '@tanstack/react-query';
import { ClipboardXIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { nonConformitiesApi } from './api';
import { NC_TYPE_LABELS } from './labels';

/** Aviso no detalhe do lote quando há não conformidade aberta (com link para cada uma). */
export function OpenNcAlert({ lotId }: { lotId: string }) {
  const query = useQuery({
    queryKey: ['non-conformities', 'list', { lotId, status: 'OPEN' }],
    queryFn: ({ signal }) =>
      nonConformitiesApi.list({ lotId, status: 'OPEN', pageSize: 10 }, signal),
  });
  const open = query.data?.data ?? [];
  if (open.length === 0) return null;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/5">
      <ClipboardXIcon className="text-amber-700 dark:text-amber-400" />
      <AlertTitle>
        {open.length === 1 ? 'Não conformidade aberta' : `${open.length} não conformidades abertas`}
      </AlertTitle>
      <AlertDescription>
        <ul className="space-y-0.5">
          {open.map((nc) => (
            <li key={nc.id}>
              <Link
                to={`/qualidade/${nc.id}`}
                className="font-mono text-primary underline-offset-4 hover:underline"
              >
                {nc.number}
              </Link>{' '}
              · {NC_TYPE_LABELS[nc.type]} · {nc.description}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

import { BellIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ALERT_DAYS, useExpiringLots } from './api';
import { countOf, plural } from '@/lib/plural';

/** Sino do cabeçalho: lotes com saldo vencendo em 30 dias (inclui vencidos). */
export function ExpiryBell() {
  const query = useExpiringLots();
  const count = query.data?.data.length ?? 0;
  const expired = query.data?.expiredCount ?? 0;
  const label =
    count === 0
      ? `Nenhum lote vencendo em ${ALERT_DAYS} dias`
      : `${countOf(count, 'lote', 'lotes')} vencendo em ${ALERT_DAYS} dias${expired > 0 ? `, ${expired} ${plural(expired, 'vencido', 'vencidos')}` : ''}`;

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link to={`/lotes?vencendo=${ALERT_DAYS}`} aria-label={label} title={label}>
        <BellIcon />
        {count > 0 && (
          <span
            aria-hidden
            className={
              expired > 0
                ? 'absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-4 font-semibold text-white'
                : 'absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[0.625rem] leading-4 font-semibold text-black'
            }
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
    </Button>
  );
}

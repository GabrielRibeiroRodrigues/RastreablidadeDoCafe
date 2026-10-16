import { ShieldAlertIcon, ShieldXIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { LotDetail } from './api';

/**
 * Explica no detalhe do lote o efeito prático de um status restritivo (a API recusa saídas e
 * transferências de lotes bloqueados ou em quarentena; estornos continuam permitidos).
 */
export function LotStatusAlert({ status }: { status: LotDetail['status'] }) {
  if (status === 'BLOCKED') {
    return (
      <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
        <ShieldXIcon />
        <AlertTitle>Lote bloqueado</AlertTitle>
        <AlertDescription>
          Saídas, transferências e consumo estão suspensos; estornos continuam permitidos. O
          bloqueio pode vir de um{' '}
          <Link to="/recall" className="font-medium underline underline-offset-4">
            recall
          </Link>{' '}
          ou de uma decisão manual — a liberação é feita por um administrador em “Alterar status”.
        </AlertDescription>
      </Alert>
    );
  }
  if (status === 'QUARANTINE') {
    return (
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <ShieldAlertIcon className="text-amber-700 dark:text-amber-400" />
        <AlertTitle>Lote em quarentena</AlertTitle>
        <AlertDescription>
          Só pode ser movido para uma área de quarentena até ser liberado em{' '}
          <Link to="/qualidade" className="font-medium underline underline-offset-4">
            Qualidade
          </Link>{' '}
          ou por um administrador.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

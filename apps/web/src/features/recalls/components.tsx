import {
  CheckIcon,
  CircleDashedIcon,
  Loader2Icon,
  MinusIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatQuantity } from '@/lib/quantity';
import type {
  RecallSeverity,
  RecallStatus,
  RecallStep,
  RecallStepStatus,
  UnitQuantity,
} from './api';
import {
  RECALL_SEVERITY_LABELS,
  RECALL_STATUS_LABELS,
  RECALL_STEP_HINTS,
  RECALL_STEP_LABELS,
  RECALL_STEP_STATUS_LABELS,
  RECALL_STEPS,
} from './labels';

const STATUS_STYLES: Record<RecallStatus, string> = {
  OPEN: 'bg-sky-600/10 text-sky-700 dark:text-sky-400',
  EXECUTING: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  COMPLETED: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  FAILED: 'bg-destructive/10 text-destructive',
  CLOSED: 'bg-muted text-muted-foreground',
};

export function RecallStatusBadge({
  status,
  className,
}: {
  status: RecallStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[status], className)}>
      {status === 'EXECUTING' && <Loader2Icon className="animate-spin" aria-hidden />}
      {RECALL_STATUS_LABELS[status]}
    </Badge>
  );
}

const SEVERITY_STYLES: Record<RecallSeverity, string> = {
  LOW: 'border-sky-600/30 text-sky-700 dark:text-sky-400',
  MEDIUM: 'border-amber-500/40 text-amber-800 dark:text-amber-300',
  HIGH: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: RecallSeverity;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(SEVERITY_STYLES[severity], className)}>
      Severidade {RECALL_SEVERITY_LABELS[severity].toLowerCase()}
    </Badge>
  );
}

/**
 * Progresso das 3 etapas na lista. A listagem não traz as etapas, então o progresso é deduzido
 * do status do recall (concluído/encerrado = 3 de 3).
 */
export function RecallProgress({ status }: { status: RecallStatus }) {
  const done = status === 'COMPLETED' || status === 'CLOSED' ? 3 : 0;
  const label =
    status === 'EXECUTING'
      ? 'Etapas em execução'
      : status === 'FAILED'
        ? 'Uma etapa falhou'
        : `${done} de 3 etapas concluídas`;
  return (
    <div className="flex items-center gap-1" role="img" aria-label={label} title={label}>
      {RECALL_STEPS.map((step, index) => (
        <span
          key={step}
          className={cn(
            'h-1.5 w-5 rounded-full bg-muted',
            index < done && 'bg-emerald-600 dark:bg-emerald-500',
            status === 'EXECUTING' && 'animate-pulse bg-amber-500',
            status === 'FAILED' && 'bg-destructive/60',
          )}
        />
      ))}
    </div>
  );
}

const STEP_ICONS: Record<RecallStepStatus, LucideIcon> = {
  PENDING: CircleDashedIcon,
  RUNNING: Loader2Icon,
  COMPLETED: CheckIcon,
  FAILED: XIcon,
  SKIPPED: MinusIcon,
};

const STEP_ICON_STYLES: Record<RecallStepStatus, string> = {
  PENDING: 'border-dashed text-muted-foreground',
  RUNNING: 'border-amber-500 text-amber-700 dark:text-amber-300',
  COMPLETED: 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500',
  FAILED: 'border-destructive bg-destructive text-white',
  SKIPPED: 'text-muted-foreground',
};

/** Linha do tempo das etapas (BLOCK_LOTS → REPORT → NOTIFY) com status, horários e erro. */
export function StepsTimeline({ steps }: { steps: RecallStep[] }) {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  return (
    <ol className="space-y-0">
      {ordered.map((step, index) => {
        const Icon = STEP_ICONS[step.status];
        const last = index === ordered.length - 1;
        return (
          <li key={step.name} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-border"
              />
            )}
            <span
              className={cn(
                'relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-card',
                STEP_ICON_STYLES[step.status],
              )}
            >
              <Icon
                className={cn('size-4', step.status === 'RUNNING' && 'animate-spin')}
                aria-hidden
              />
            </span>
            <div className="min-w-0 flex-1 space-y-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">
                  {index + 1}. {RECALL_STEP_LABELS[step.name]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {RECALL_STEP_STATUS_LABELS[step.status]}
                  {step.attempts > 1 && ` · ${step.attempts} tentativas`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{RECALL_STEP_HINTS[step.name]}</p>
              {(step.startedAt || step.finishedAt) && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {step.startedAt && <>Início {formatDateTime(step.startedAt)}</>}
                  {step.finishedAt && <> · Fim {formatDateTime(step.finishedAt)}</>}
                </p>
              )}
              {step.error && (
                <p className="rounded-md bg-destructive/10 px-2 py-1 font-mono text-xs break-words text-destructive">
                  {step.error}
                </p>
              )}
              {step.status === 'SKIPPED' && step.name === 'REPORT' && (
                <p className="text-xs text-muted-foreground">
                  Armazenamento de arquivos não configurado: relatório não gerado.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "12 sc + 40 kg" (quantidades agrupadas por unidade). */
export function UnitQuantities({ items }: { items: UnitQuantity[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {items.map((item) => formatQuantity(item.quantity, item.unit)).join(' + ')}
    </span>
  );
}

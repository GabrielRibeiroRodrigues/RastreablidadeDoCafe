import type { RecallSeverity, RecallStatus, RecallStepName, RecallStepStatus } from './api';

export const RECALL_STATUS_LABELS: Record<RecallStatus, string> = {
  OPEN: 'Aberto',
  EXECUTING: 'Em execução',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  CLOSED: 'Encerrado',
};

export const RECALL_SEVERITY_LABELS: Record<RecallSeverity, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
};

export const RECALL_SEVERITY_HINTS: Record<RecallSeverity, string> = {
  LOW: 'Risco baixo à saúde; recolhimento preventivo.',
  MEDIUM: 'Pode causar problema temporário; contato com clientes em até 48 h.',
  HIGH: 'Risco sério à saúde (ex.: contaminação): contato imediato.',
};

export const RECALL_STEP_LABELS: Record<RecallStepName, string> = {
  BLOCK_LOTS: 'Bloquear lotes',
  REPORT: 'Gerar relatório',
  NOTIFY: 'Notificar',
};

export const RECALL_STEP_HINTS: Record<RecallStepName, string> = {
  BLOCK_LOTS: 'Todos os lotes afetados passam a Bloqueado (o status anterior fica registrado).',
  REPORT: 'PDF com motivo, lotes e clientes a contatar.',
  NOTIFY: 'Aviso à equipe com os lotes bloqueados e os clientes a contatar.',
};

export const RECALL_STEP_STATUS_LABELS: Record<RecallStepStatus, string> = {
  PENDING: 'Pendente',
  RUNNING: 'Em execução',
  COMPLETED: 'Concluída',
  FAILED: 'Falhou',
  SKIPPED: 'Ignorada',
};

export const RECALL_STATUSES = Object.keys(RECALL_STATUS_LABELS) as RecallStatus[];
export const RECALL_STEPS: RecallStepName[] = ['BLOCK_LOTS', 'REPORT', 'NOTIFY'];

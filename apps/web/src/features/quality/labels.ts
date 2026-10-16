import type { NonConformityStatus, NonConformityType } from './api';

export const NC_TYPE_LABELS: Record<NonConformityType, string> = {
  MOISTURE: 'Umidade',
  DEFECTS: 'Defeitos',
  CONTAMINATION: 'Contaminação',
  PEST: 'Pragas',
  PACKAGING: 'Embalagem',
  OTHER: 'Outro',
};

export const NC_STATUS_LABELS: Record<NonConformityStatus, string> = {
  OPEN: 'Aberta',
  RELEASED: 'Liberada',
  DISCARDED: 'Descartada',
};

export const NC_TYPES = Object.keys(NC_TYPE_LABELS) as NonConformityType[];
export const NC_STATUSES = Object.keys(NC_STATUS_LABELS) as NonConformityStatus[];

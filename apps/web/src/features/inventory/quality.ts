import { z } from 'zod';
import { ROAST_LEVELS } from '@/features/products/labels';
import type { LotDetail, LotUpdateInput } from './api';

/**
 * Validade e qualidade do café: comuns ao recebimento e à edição do lote. Os campos chegam como
 * texto (aceitando vírgula decimal) e viram números/`null` no `transform` (mesmas faixas da API).
 */

const toNumber = (text: string): number => Number(text.trim().replace(',', '.'));

function optionalNumber({
  min,
  max,
  decimals,
}: {
  min: number;
  max: number;
  /** 0 = inteiro. */
  decimals: number;
}) {
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+([.,]\\d{1,${decimals}})?$`);
  const hint =
    decimals === 0
      ? `Informe um número inteiro de ${min} a ${max}.`
      : `Informe um número de ${min} a ${max} (até ${decimals} casas).`;
  return z
    .string()
    .trim()
    .refine((text) => {
      if (text === '') return true;
      if (!pattern.test(text)) return false;
      const value = toNumber(text);
      return value >= min && value <= max;
    }, hint);
}

export const qualityShape = {
  expiresAt: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida.'),
  harvest: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}(\/\d{2})?$/.test(v), 'Use o formato 2025 ou 2025/26.'),
  variety: z.string().trim().max(60, 'Informe no máximo 60 caracteres.'),
  altitudeMeters: optionalNumber({ min: 0, max: 3000, decimals: 0 }),
  screenSize: optionalNumber({ min: 8, max: 20, decimals: 0 }),
  moisturePercent: optionalNumber({ min: 0, max: 100, decimals: 2 }),
  roastLevel: z.enum(ROAST_LEVELS).or(z.literal('')),
  cuppingScore: optionalNumber({ min: 0, max: 100, decimals: 2 }),
  notes: z.string().trim().max(1000, 'Informe no máximo 1000 caracteres.'),
};

export const QUALITY_FIELDS = [
  'expiresAt',
  'harvest',
  'variety',
  'altitudeMeters',
  'screenSize',
  'moisturePercent',
  'roastLevel',
  'cuppingScore',
  'notes',
] as const;

export type QualityValues = z.infer<ReturnType<typeof z.object<typeof qualityShape>>>;

const numberOrNull = (text: string): number | null => (text === '' ? null : toNumber(text));
const textOrNull = (text: string): string | null => (text === '' ? null : text);

/** Valores do formulário (já validados) → campos do DTO (vazio = `null`, limpa o campo). */
export function toQualityDto(values: QualityValues): Required<LotUpdateInput> {
  return {
    expiresAt: textOrNull(values.expiresAt),
    harvest: textOrNull(values.harvest),
    variety: textOrNull(values.variety),
    altitudeMeters: numberOrNull(values.altitudeMeters),
    screenSize: numberOrNull(values.screenSize),
    moisturePercent: numberOrNull(values.moisturePercent),
    roastLevel: values.roastLevel === '' ? null : values.roastLevel,
    cuppingScore: numberOrNull(values.cuppingScore),
    notes: textOrNull(values.notes),
  };
}

const numberText = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value).replace('.', ',');

export function toQualityValues(lot: LotDetail | null): QualityValues {
  return {
    expiresAt: lot?.expiresAt?.slice(0, 10) ?? '',
    harvest: lot?.harvest ?? '',
    variety: lot?.variety ?? '',
    altitudeMeters: numberText(lot?.altitudeMeters),
    screenSize: numberText(lot?.screenSize),
    moisturePercent: numberText(lot?.moisturePercent),
    roastLevel: lot?.roastLevel ?? '',
    cuppingScore: numberText(lot?.cuppingScore),
    notes: lot?.notes ?? '',
  };
}

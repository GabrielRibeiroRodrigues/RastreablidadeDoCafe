import type { ProductType } from '@/features/products/api';
import type { ProductionStage } from './api';

export const STAGE_LABELS: Record<ProductionStage, string> = {
  PROCESSING: 'Beneficiamento',
  ROASTING: 'Torra',
  BLENDING: 'Blend',
  PACKAGING: 'Embalagem',
};

export const STAGES = Object.keys(STAGE_LABELS) as ProductionStage[];

/** Uma linha sobre cada etapa, exibida na escolha da etapa. */
export const STAGE_HINTS: Record<ProductionStage, string> = {
  PROCESSING: 'Café verde → café verde beneficiado (limpeza, rebenefício, classificação).',
  ROASTING: 'Café verde → torrado. Rendimento típico de 75% a 90% (perda de umidade).',
  BLENDING: 'Torrados e blends → um blend novo, misturando origens.',
  PACKAGING: 'Torrado ou blend (+ embalagens) → produto embalado.',
};

/** Mesmas regras da API (`STAGE_RULES`): tipos de produto aceitos como insumo e como saída. */
export const STAGE_RULES: Record<
  ProductionStage,
  { inputs: readonly ProductType[]; output: readonly ProductType[] }
> = {
  PROCESSING: { inputs: ['GREEN'], output: ['GREEN'] },
  ROASTING: { inputs: ['GREEN'], output: ['ROASTED'] },
  BLENDING: { inputs: ['ROASTED', 'BLEND'], output: ['BLEND'] },
  PACKAGING: { inputs: ['ROASTED', 'BLEND', 'PACKAGING'], output: ['ROASTED', 'BLEND'] },
};

/** Faixa de rendimento esperada na torra (fora dela, a tela avisa). */
export const ROASTING_YIELD_RANGE = { min: 75, max: 90 } as const;

const STAGE_STYLES: Record<ProductionStage, string> = {
  PROCESSING: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  ROASTING: 'bg-orange-600/10 text-orange-800 dark:text-orange-300',
  BLENDING: 'bg-violet-600/10 text-violet-700 dark:text-violet-300',
  PACKAGING: 'bg-sky-600/10 text-sky-700 dark:text-sky-400',
};

export const stageStyle = (stage: ProductionStage): string => STAGE_STYLES[stage];

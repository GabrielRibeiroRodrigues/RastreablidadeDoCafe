import type { ProductType, RoastLevel, Unit } from './api';

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  GREEN: 'Café verde',
  ROASTED: 'Torrado',
  BLEND: 'Blend',
  PACKAGING: 'Embalagem',
};

export const UNIT_LABELS: Record<Unit, string> = {
  KG: 'kg',
  BAG_60KG: 'Saca (60 kg)',
  UNIT: 'Unidade',
};

export const ROAST_LEVEL_LABELS: Record<RoastLevel, string> = {
  LIGHT: 'Clara',
  MEDIUM_LIGHT: 'Média-clara',
  MEDIUM: 'Média',
  MEDIUM_DARK: 'Média-escura',
  DARK: 'Escura',
};

export const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_LABELS) as ProductType[];
export const UNITS = Object.keys(UNIT_LABELS) as Unit[];
export const ROAST_LEVELS = Object.keys(ROAST_LEVEL_LABELS) as RoastLevel[];

/** Só torrados e blends têm grau de torra (regra da API). */
export const ROASTABLE_TYPES: readonly ProductType[] = ['ROASTED', 'BLEND'];

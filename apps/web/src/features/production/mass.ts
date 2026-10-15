import type { ProductType } from '@/features/products/api';
import { parseQuantityInput, toKgMilli, type UnitCode } from '@/lib/quantity';

export interface MassInput {
  quantity: string;
  unit: UnitCode;
  productType: ProductType;
}

export interface MassPreview {
  /** Massa de entrada em kg (milésimos); embalagens e unidades ficam fora (regra da API). */
  inputKg: bigint;
  /** Massa de saída em kg (milésimos); `null` se a quantidade não foi informada ou é em unidades. */
  outputKg: bigint | null;
  /** Insumos que não entram no rendimento (embalagens, quantidades em unidades). */
  excluded: number;
  yieldPercent: number | null;
  lossKg: bigint | null;
}

/** Mesmo cálculo da API: rendimento = saída ÷ entrada (kg; 1 saca = 60 kg). */
export function massPreview(
  inputs: MassInput[],
  output: { quantity: string; unit: UnitCode } | null,
): MassPreview {
  let inputKg = 0n;
  let excluded = 0;
  for (const input of inputs) {
    const quantity = parseQuantityInput(input.quantity);
    if (quantity === null) continue;
    const kg = input.productType === 'PACKAGING' ? null : toKgMilli(quantity, input.unit);
    if (kg === null) excluded += 1;
    else inputKg += kg;
  }

  const outputQuantity = output ? parseQuantityInput(output.quantity) : null;
  const outputKg = output && outputQuantity ? toKgMilli(outputQuantity, output.unit) : null;

  if (outputKg === null || inputKg === 0n) {
    return { inputKg, outputKg, excluded, yieldPercent: null, lossKg: null };
  }
  return {
    inputKg,
    outputKg,
    excluded,
    yieldPercent: Math.round((Number(outputKg) / Number(inputKg)) * 10_000) / 100,
    lossKg: inputKg - outputKg,
  };
}

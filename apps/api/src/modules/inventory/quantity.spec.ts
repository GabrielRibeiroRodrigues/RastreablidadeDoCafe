import { describe, expect, it } from 'vitest';
import { formatQuantity, formatQuantityPt } from './quantity.js';

describe('formatQuantityPt', () => {
  it('drops trailing zeros and uses the short pt-BR unit', () => {
    expect(formatQuantityPt('15.000', 'BAG_60KG')).toBe('15 sc');
    expect(formatQuantityPt('70.000', 'KG')).toBe('70 kg');
    expect(formatQuantityPt('3', 'UNIT')).toBe('3 un');
  });

  it('groups thousands with a dot and decimals with a comma', () => {
    expect(formatQuantityPt('1250.500', 'KG')).toBe('1.250,5 kg');
    expect(formatQuantityPt('0.125')).toBe('0,125');
  });

  it('keeps the API format (three decimals) separate', () => {
    expect(formatQuantity('15')).toBe('15.000');
  });
});

import { describe, expect, it } from 'vitest';
import { bucketTick, xLabelIndexes } from './performance';

describe('yield chart x axis', () => {
  it('labels every bar when there are few', () => {
    expect([...xLabelIndexes(3)]).toEqual([0, 1, 2]);
    expect(xLabelIndexes(8).size).toBe(8);
  });

  it('thins the labels out with many bars, keeping the first and the last', () => {
    const picked = xLabelIndexes(53);
    expect(picked.size).toBeLessThanOrEqual(9);
    expect(picked.has(0)).toBe(true);
    expect(picked.has(52)).toBe(true);
    expect(picked.has(51)).toBe(false);
  });

  it('uses short tick texts', () => {
    expect(bucketTick('2026-09-28', 'week')).toBe('28/09');
    expect(bucketTick('2026-10-01', 'month')).toBe('out');
  });
});

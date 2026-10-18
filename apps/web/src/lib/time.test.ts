import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it.each([
    [10_000, 'agora'],
    [5 * 60_000, 'há 5 minutos'],
    [3 * 3_600_000, 'há 3 horas'],
    [26 * 3_600_000, 'ontem'],
    [3 * 86_400_000, 'há 3 dias'],
  ])('%i ms → %s', (ms, expected) => {
    expect(timeAgo(ago(ms), now)).toBe(expected);
  });
});

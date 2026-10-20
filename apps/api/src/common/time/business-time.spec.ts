import { describe, expect, it } from 'vitest';
import { businessYear } from './business-time.js';

describe('businessYear', () => {
  it('uses the São Paulo calendar, not UTC', () => {
    // 31/12/2026 22:30 em Brasília = 01/01/2027 01:30 UTC.
    expect(businessYear(new Date('2027-01-01T01:30:00Z'))).toBe(2026);
    expect(businessYear(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
  });
});

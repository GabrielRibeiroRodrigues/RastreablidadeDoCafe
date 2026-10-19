import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { FUTURE_TOLERANCE_MS, IsNotFuture } from './not-future.js';

class Probe {
  @IsNotFuture()
  at?: string;
}

const errorsFor = (at: string) => {
  const probe = new Probe();
  probe.at = at;
  return validateSync(probe);
};

describe('IsNotFuture', () => {
  it('accepts past dates and a small clock skew', () => {
    expect(errorsFor('2026-01-01T12:00:00Z')).toHaveLength(0);
    expect(errorsFor(new Date(Date.now() + FUTURE_TOLERANCE_MS - 1000).toISOString())).toHaveLength(
      0,
    );
  });

  it('rejects dates in the future', () => {
    const [error] = errorsFor(new Date(Date.now() + 86_400_000).toISOString());
    expect(error?.constraints).toEqual({ isNotFuture: 'at cannot be in the future' });
  });
});

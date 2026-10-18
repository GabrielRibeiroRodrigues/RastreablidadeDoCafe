import { describe, expect, it } from 'vitest';
import { describeError } from './recall-steps.service.js';

describe('describeError', () => {
  it('uses the error message when there is one', () => {
    expect(describeError(new Error('SNS throttled'))).toBe('SNS throttled');
  });

  it('unwraps network AggregateErrors, whose own message is empty', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9000'), {
      code: 'ECONNREFUSED',
    });
    const ipv6 = Object.assign(new Error('connect ECONNREFUSED ::1:9000'), {
      code: 'ECONNREFUSED',
    });
    expect(describeError(new AggregateError([refused, ipv6]))).toBe(
      'connect ECONNREFUSED 127.0.0.1:9000; connect ECONNREFUSED ::1:9000',
    );
  });

  it('falls back to the error name and code', () => {
    const error = Object.assign(new Error(''), { name: 'TimeoutError', code: 'ETIMEDOUT' });
    expect(describeError(error)).toBe('TimeoutError (ETIMEDOUT)');
    expect(describeError('plain')).toBe('plain');
  });
});

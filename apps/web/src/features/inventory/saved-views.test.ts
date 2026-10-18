import { describe, expect, it } from 'vitest';
import { viewSearch } from './saved-views';

describe('viewSearch', () => {
  it('drops the page and normalizes the order of the filters', () => {
    expect(viewSearch(new URLSearchParams('page=3&status=BLOCKED&q=bourbon'))).toBe(
      'q=bourbon&status=BLOCKED',
    );
    expect(viewSearch(new URLSearchParams('status=BLOCKED&q=bourbon'))).toBe(
      viewSearch(new URLSearchParams('q=bourbon&status=BLOCKED&page=1')),
    );
    expect(viewSearch(new URLSearchParams(''))).toBe('');
  });
});

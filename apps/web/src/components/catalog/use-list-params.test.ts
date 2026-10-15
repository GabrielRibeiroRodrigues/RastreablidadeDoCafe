import { describe, expect, it } from 'vitest';
import { parseListParams } from './use-list-params';

const config = {
  sorts: ['name', '-name', 'sku', '-sku'],
  defaultSort: 'name',
  filters: { type: ['GREEN', 'ROASTED'] },
};

describe('parseListParams', () => {
  it('uses defaults for an empty URL', () => {
    expect(parseListParams(new URLSearchParams(), config)).toEqual({
      page: 1,
      pageSize: 20,
      q: '',
      status: 'active',
      sort: 'name',
      filters: {},
    });
  });

  it('reads valid values', () => {
    const search = new URLSearchParams(
      'page=3&pageSize=50&q=+bourbon+&status=all&sort=-sku&type=GREEN',
    );
    expect(parseListParams(search, config)).toEqual({
      page: 3,
      pageSize: 50,
      q: 'bourbon',
      status: 'all',
      sort: '-sku',
      filters: { type: 'GREEN' },
    });
  });

  it('ignores invalid values from hand-edited links', () => {
    const search = new URLSearchParams('page=-2&pageSize=7&status=x&sort=password&type=TEA');
    expect(parseListParams(search, config)).toMatchObject({
      page: 1,
      pageSize: 20,
      status: 'active',
      sort: 'name',
      filters: {},
    });
  });
});

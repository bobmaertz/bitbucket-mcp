import { describe, it, expect } from 'vitest';
import { buildListQuery, buildDiffQuery } from './query.js';

describe('buildListQuery', () => {
  it('returns an empty string when there are no options', () => {
    expect(buildListQuery()).toBe('');
    expect(buildListQuery({})).toBe('');
  });

  it('omits falsy and empty values', () => {
    expect(buildListQuery({ page: 0, pagelen: undefined, q: '', sort: '' })).toBe('');
  });

  it('appends params in a stable order', () => {
    expect(
      buildListQuery({
        sort: '-updated_on',
        q: 'state="OPEN"',
        state: 'OPEN',
        pagelen: 25,
        page: 2,
        fields: 'values.id,next',
      })
    ).toBe(
      '?page=2&pagelen=25&state=OPEN&q=state%3D%22OPEN%22&sort=-updated_on&fields=values.id%2Cnext'
    );
  });

  it('emits only the fields param when that is all that is set', () => {
    expect(buildListQuery({ fields: 'id,title' })).toBe('?fields=id%2Ctitle');
  });
});

describe('buildDiffQuery', () => {
  it('returns an empty string with no options', () => {
    expect(buildDiffQuery()).toBe('');
    expect(buildDiffQuery({})).toBe('');
  });

  it('repeats the path param for an array of files', () => {
    expect(buildDiffQuery({ path: ['a.ts', 'b.ts'] })).toBe('?path=a.ts&path=b.ts');
  });

  it('accepts a single path string', () => {
    expect(buildDiffQuery({ path: 'src/a.ts' })).toBe('?path=src%2Fa.ts');
  });

  it('emits context, including an explicit zero', () => {
    expect(buildDiffQuery({ context: 0 })).toBe('?context=0');
    expect(buildDiffQuery({ context: 5 })).toBe('?context=5');
  });

  it('drops a non-finite context', () => {
    expect(buildDiffQuery({ context: NaN })).toBe('');
  });
});

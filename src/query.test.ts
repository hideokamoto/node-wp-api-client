import { describe, expect, it } from 'vitest';
import { buildQuery } from './query';

describe('buildQuery', () => {
  it('returns empty params for empty query', () => {
    expect(buildQuery({}).toString()).toBe('');
    expect(buildQuery(undefined).toString()).toBe('');
  });

  it('serializes strings and numbers', () => {
    const params = buildQuery({ search: 'hello world', page: 2, per_page: 10 });
    expect(params.get('search')).toBe('hello world');
    expect(params.get('page')).toBe('2');
    expect(params.get('per_page')).toBe('10');
  });

  it('skips undefined and null values', () => {
    const params = buildQuery({ search: undefined, page: null as unknown as undefined, slug: 'a' });
    expect(params.has('search')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.get('slug')).toBe('a');
  });

  it('joins arrays with commas', () => {
    const params = buildQuery({ include: [1, 2, 3], slug: ['a', 'b'] });
    expect(params.get('include')).toBe('1,2,3');
    expect(params.get('slug')).toBe('a,b');
  });

  it('omits empty arrays', () => {
    const params = buildQuery({ include: [], slug: 'a' });
    expect(params.has('include')).toBe(false);
    expect(params.get('slug')).toBe('a');
    expect(params.toString()).toBe('slug=a');
  });

  it('serializes booleans as true/false', () => {
    const params = buildQuery({ hide_empty: true, sticky: false });
    expect(params.get('hide_empty')).toBe('true');
    expect(params.get('sticky')).toBe('false');
  });

  it('serializes Date values as ISO 8601 strings', () => {
    const date = new Date('2024-01-15T10:00:00.000Z');
    const params = buildQuery({ after: date });
    expect(params.get('after')).toBe('2024-01-15T10:00:00.000Z');
  });

  it('serializes _embed: true as _embed=1', () => {
    const params = buildQuery({ _embed: true });
    expect(params.get('_embed')).toBe('1');
  });

  it('omits _embed: false', () => {
    const params = buildQuery({ _embed: false });
    expect(params.has('_embed')).toBe(false);
  });

  it('serializes _embed with specific relations', () => {
    expect(buildQuery({ _embed: 'wp:term' }).get('_embed')).toBe('wp:term');
    expect(buildQuery({ _embed: ['wp:term', 'author'] }).get('_embed')).toBe('wp:term,author');
  });

  it('omits _embed: []', () => {
    const params = buildQuery({ _embed: [] });
    expect(params.has('_embed')).toBe(false);
  });

  it('joins _fields with commas', () => {
    const params = buildQuery({ _fields: ['id', 'title', '_links.wp:term'] });
    expect(params.get('_fields')).toBe('id,title,_links.wp:term');
  });
});

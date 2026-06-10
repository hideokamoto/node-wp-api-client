import { describe, expectTypeOf, it } from 'vitest';
import { createWPClient } from './client';
import type { WPCategory, WPPost, WPPostEmbedded } from './entities';

const wp = createWPClient({ baseUrl: 'https://example.com' });

describe('response type resolution', () => {
  it('returns the full entity when no shape-changing query is used', async () => {
    const { items } = await wp.posts.list({ page: 1, per_page: 10 });
    expectTypeOf(items).toEqualTypeOf<WPPost[]>();
    // _embedded is NOT present unless _embed is requested
    type Item = (typeof items)[number];
    expectTypeOf<Extract<keyof Item, '_embedded'>>().toEqualTypeOf<never>();
  });

  it('adds _embedded when _embed: true is passed', async () => {
    const { items } = await wp.posts.list({ _embed: true });
    expectTypeOf(items[0]?._embedded).toEqualTypeOf<WPPostEmbedded | undefined>();
  });

  it('adds _embedded when _embed is a relation filter', async () => {
    const { items } = await wp.posts.list({ _embed: 'wp:term' });
    expectTypeOf(items[0]?._embedded).toEqualTypeOf<WPPostEmbedded | undefined>();
  });

  it('narrows the response to the picked fields with _fields (no `as const` needed)', async () => {
    const { items } = await wp.posts.list({ _fields: ['id', 'title', 'slug'] });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'id' | 'title' | 'slug'>();
    expectTypeOf<Item['id']>().toEqualTypeOf<number>();
    expectTypeOf<Item['title']>().toEqualTypeOf<{ rendered: string }>();
  });

  it('supports nested field paths, picking the top-level key', async () => {
    const { items } = await wp.posts.list({
      _embed: true,
      _fields: ['_links.wp:term', '_embedded', 'id', 'slug', 'title'],
    });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'_links' | '_embedded' | 'id' | 'slug' | 'title'>();
    expectTypeOf<Item['_embedded']>().toEqualTypeOf<WPPostEmbedded>();
  });

  it('drops _embedded from the result when _fields includes it but _embed is not set', async () => {
    const { items } = await wp.posts.list({ _fields: ['id', '_embedded'] });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'id'>();
  });

  it('narrows to the embed context shape with context: "embed"', async () => {
    const { items } = await wp.posts.list({ context: 'embed' });
    type Item = (typeof items)[number];
    expectTypeOf<Item>().toHaveProperty('id');
    expectTypeOf<Item>().toHaveProperty('title');
    // content is not exposed in the embed context
    expectTypeOf<Extract<keyof Item, 'content'>>().toEqualTypeOf<never>();
  });

  it('picks _fields from the embed-context entity when combined with context: "embed"', async () => {
    const { items } = await wp.posts.list({ context: 'embed', _fields: ['id', 'title'] });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'id' | 'title'>();
    expectTypeOf<Item['title']>().toEqualTypeOf<{ rendered: string }>();
  });

  it('adds _embedded to the embed-context entity when _embed is combined with context: "embed"', async () => {
    const { items } = await wp.posts.list({ context: 'embed', _embed: true });
    expectTypeOf(items[0]?._embedded).toEqualTypeOf<WPPostEmbedded | undefined>();
    type Item = (typeof items)[number];
    // content is not exposed in the embed context, even with _embed
    expectTypeOf<Extract<keyof Item, 'content'>>().toEqualTypeOf<never>();
  });

  it('resolves single-entity helpers the same way', async () => {
    const single = await wp.posts.get(1, { _fields: ['id', 'date'] });
    expectTypeOf<keyof typeof single>().toEqualTypeOf<'id' | 'date'>();

    const bySlug = await wp.posts.getBySlug('hello', { _embed: true });
    expectTypeOf(bySlug?._embedded).toEqualTypeOf<WPPostEmbedded | undefined>();

    const nullable = await wp.posts.getBySlug('hello');
    expectTypeOf(nullable).toEqualTypeOf<WPPost | null>();
  });

  it('resolves taxonomy collections against the term entity', async () => {
    const { items } = await wp.categories.list({ _fields: ['id', 'name', 'slug', 'count'] });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'id' | 'name' | 'slug' | 'count'>();
    expectTypeOf<Item['count']>().toEqualTypeOf<number>();
  });

  it('supports custom entity types for custom post types', async () => {
    type WPEvent = WPPost & { acf: { venue: string } };
    const events = wp.postType<WPEvent>('events');
    const { items } = await events.list({ _fields: ['id', 'acf'] });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'id' | 'acf'>();
    expectTypeOf<Item['acf']>().toEqualTypeOf<{ venue: string }>();
  });

  it('defaults custom taxonomies to the term entity', async () => {
    const stripeCategories = wp.taxonomy('stripe-categories');
    const { items } = await stripeCategories.list();
    expectTypeOf(items).toEqualTypeOf<WPCategory[]>();
  });

  it('suggests known field names in _fields', async () => {
    // @ts-expect-error -- unknown top-level field names are rejected
    await wp.posts.list({ _fields: ['no_such_field'] });
  });

  it('rejects invalid context values', async () => {
    // @ts-expect-error -- context must be view | embed | edit
    await wp.posts.list({ context: 'invalid' });
  });
});

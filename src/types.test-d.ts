import { describe, expectTypeOf, it } from 'vitest';
import { createWPClient } from './client';
import type { WPCategory, WPEditPostContent, WPPost, WPPostEmbedded } from './entities';

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

  it('exposes raw content fields with context: "edit"', async () => {
    const post = await wp.posts.get(1, { context: 'edit' });
    expectTypeOf(post.content).toEqualTypeOf<WPEditPostContent>();
    expectTypeOf(post.content.raw).toEqualTypeOf<string>();
    expectTypeOf(post.title.raw).toEqualTypeOf<string>();
    expectTypeOf(post.guid.raw).toEqualTypeOf<string>();
  });

  it('does not expose raw fields without context: "edit"', async () => {
    const post = await wp.posts.get(1);
    expectTypeOf<Extract<keyof typeof post.content, 'raw'>>().toEqualTypeOf<never>();
  });

  it('exposes raw fields on pages and media with context: "edit"', async () => {
    const page = await wp.pages.get(1, { context: 'edit' });
    expectTypeOf(page.content.raw).toEqualTypeOf<string>();

    const media = await wp.media.get(1, { context: 'edit' });
    expectTypeOf(media.title.raw).toEqualTypeOf<string>();
    expectTypeOf(media.description.raw).toEqualTypeOf<string>();
    expectTypeOf(media.caption.raw).toEqualTypeOf<string>();
  });

  it('picks edit-context fields with context: "edit" and _fields', async () => {
    const { items } = await wp.posts.list({ context: 'edit', _fields: ['id', 'content'] });
    type Item = (typeof items)[number];
    expectTypeOf<keyof Item>().toEqualTypeOf<'id' | 'content'>();
    expectTypeOf<Item['content']>().toEqualTypeOf<WPEditPostContent>();
  });

  it('adds _embedded to the edit-context entity when _embed is combined with context: "edit"', async () => {
    const { items } = await wp.posts.list({ context: 'edit', _embed: true });
    expectTypeOf(items[0]?._embedded).toEqualTypeOf<WPPostEmbedded | undefined>();
    type Item = (typeof items)[number];
    expectTypeOf<Item['content']>().toEqualTypeOf<WPEditPostContent>();
  });

  it('infers edit context for custom post types', async () => {
    type WPEvent = WPPost & { acf: { venue: string } };
    const events = wp.postType<WPEvent>('events');
    const event = await events.get(1, { context: 'edit' });
    expectTypeOf(event.content.raw).toEqualTypeOf<string>();
    expectTypeOf(event.acf.venue).toEqualTypeOf<string>();
  });

  it('exposes user edit-only fields with context: "edit"', async () => {
    const user = await wp.users.get(1, { context: 'edit' });
    expectTypeOf(user.email).toEqualTypeOf<string>();
    expectTypeOf(user.roles).toEqualTypeOf<string[]>();
  });

  it('validates edit-only _fields on posts, pages, and media', async () => {
    const post = await wp.posts.get(1, {
      context: 'edit',
      _fields: ['id', 'permalink_template', 'generated_slug', 'content'],
    });
    expectTypeOf(post.permalink_template).toEqualTypeOf<string>();
    expectTypeOf(post.generated_slug).toEqualTypeOf<string>();
    expectTypeOf(post.content.block_version).toEqualTypeOf<number>();

    const page = await wp.pages.get(1, { context: 'edit', _fields: ['permalink_template'] });
    expectTypeOf(page.permalink_template).toEqualTypeOf<string>();

    const media = await wp.media.get(1, {
      context: 'edit',
      _fields: ['filename', 'filesize', 'missing_image_sizes'],
    });
    expectTypeOf(media.filename).toEqualTypeOf<string>();
    expectTypeOf(media.filesize).toEqualTypeOf<number | null>();
    expectTypeOf(media.missing_image_sizes).toEqualTypeOf<string[]>();
    // @ts-expect-error -- permalink_template is not on media
    await wp.media.get(1, { context: 'edit', _fields: ['permalink_template'] });
  });

  it('validates _fields against the edit-context entity when context: "edit"', async () => {
    const user = await wp.users.get(1, { context: 'edit', _fields: ['id', 'email'] });
    expectTypeOf<keyof typeof user>().toEqualTypeOf<'id' | 'email'>();
    expectTypeOf(user.email).toEqualTypeOf<string>();
    // @ts-expect-error -- email is not a view-context field
    await wp.users.get(1, { _fields: ['email'] });
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

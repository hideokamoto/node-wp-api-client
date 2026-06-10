import { describe, expect, it, vi } from 'vitest';
import { createWPClient } from './client';

type FetchMock = ReturnType<typeof vi.fn>;

const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const post = (id: number, slug = `post-${id}`) => ({
  id,
  slug,
  title: { rendered: `Post ${id}` },
});

const lastRequestUrl = (fetchMock: FetchMock): URL =>
  new URL(fetchMock.mock.calls.at(-1)?.[0] as string);

describe('createWPClient', () => {
  describe('posts.list', () => {
    it('fetches /wp/v2/posts and returns items with pagination info', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([post(1), post(2)], {
          'X-WP-Total': '25',
          'X-WP-TotalPages': '13',
        })
      );
      const wp = createWPClient({ baseUrl: 'https://wp-api.wp-kyoto.net', fetch: fetchMock });

      const result = await wp.posts.list({ page: 2, per_page: 2 });

      const url = lastRequestUrl(fetchMock);
      expect(url.pathname).toBe('/wp-json/wp/v2/posts');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('per_page')).toBe('2');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(13);
    });

    it('defaults total and totalPages to items length / 1 when headers are missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([post(1)]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.posts.list();
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('returns totalPages=0 when there are no items and X-WP-TotalPages is missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.posts.list();
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('derives totalPages from total and per_page when X-WP-TotalPages is missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([post(1), post(2)], { 'X-WP-Total': '5' })
      );
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.posts.list({ per_page: 2 });
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3); // Math.ceil(5/2)
    });

    it('uses defaultQuery.per_page to derive totalPages when X-WP-TotalPages is missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([post(1), post(2)], { 'X-WP-Total': '5' })
      );
      const wp = createWPClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        defaultQuery: { per_page: 2 },
      });
      const result = await wp.posts.list();
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3); // Math.ceil(5/2) using defaultQuery.per_page
    });
  });

  describe('posts.get', () => {
    it('fetches a single post by ID', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(post(123)));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.posts.get(123);
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/wp/v2/posts/123');
      expect(result.id).toBe(123);
    });
  });

  describe('posts.get id validation', () => {
    it.each([
      Number.NaN,
      1.5,
      -1,
      0,
      Number.POSITIVE_INFINITY,
    ])('rejects invalid id %p with a TypeError without making a request', async (id) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(post(1)));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await expect(wp.posts.get(id)).rejects.toThrow(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a path traversal id passed from untyped code', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(post(1)));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await expect(wp.posts.get('1/../../users' as unknown as number)).rejects.toThrow(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('posts.getBySlug', () => {
    it('returns the first matching post', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([post(1, 'hello-world')]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.posts.getBySlug('hello-world');
      expect(lastRequestUrl(fetchMock).searchParams.get('slug')).toBe('hello-world');
      expect(result?.slug).toBe('hello-world');
    });

    it('returns null when no post matches', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.posts.getBySlug('not-found');
      expect(result).toBeNull();
    });

    it('passes extra query options through', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([post(1)]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await wp.posts.getBySlug('hello', { _embed: true });
      expect(lastRequestUrl(fetchMock).searchParams.get('_embed')).toBe('1');
    });

    it('requests only a single item with per_page=1', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([post(1)]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await wp.posts.getBySlug('hello');
      expect(lastRequestUrl(fetchMock).searchParams.get('per_page')).toBe('1');
    });
  });

  describe('posts.listAll', () => {
    it('fetches every page and concatenates the results', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse([post(1), post(2)], { 'X-WP-Total': '5', 'X-WP-TotalPages': '3' })
        )
        .mockResolvedValueOnce(
          jsonResponse([post(3), post(4)], { 'X-WP-Total': '5', 'X-WP-TotalPages': '3' })
        )
        .mockResolvedValueOnce(
          jsonResponse([post(5)], { 'X-WP-Total': '5', 'X-WP-TotalPages': '3' })
        );
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });

      const items = await wp.posts.listAll();

      expect(items.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const firstUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
      expect(firstUrl.searchParams.get('per_page')).toBe('100');
      expect(firstUrl.searchParams.get('page')).toBe('1');
    });

    it('stops after a single page when there are no more pages', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse([post(1)], { 'X-WP-Total': '1', 'X-WP-TotalPages': '1' }));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const items = await wp.posts.listAll();
      expect(items).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fetches all pages when X-WP-TotalPages is missing but X-WP-Total indicates multiple pages', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse([post(1), post(2)], { 'X-WP-Total': '3' }))
        .mockResolvedValueOnce(jsonResponse([post(3)], { 'X-WP-Total': '3' }));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const items = await wp.posts.listAll({ per_page: 2 });
      expect(items.map((p) => p.id)).toEqual([1, 2, 3]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('limits concurrent page requests and preserves page order', async () => {
      const totalPages = 9;
      let active = 0;
      let maxActive = 0;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        const page = Number(new URL(url).searchParams.get('page'));
        return jsonResponse([post(page)], {
          'X-WP-Total': String(totalPages),
          'X-WP-TotalPages': String(totalPages),
        });
      });
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });

      const items = await wp.posts.listAll();

      expect(items.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(fetchMock).toHaveBeenCalledTimes(totalPages);
      expect(maxActive).toBeLessThanOrEqual(5);
    });
  });

  describe('built-in collections', () => {
    type WP = ReturnType<typeof createWPClient>;
    it.each([
      ['pages', '/wp-json/wp/v2/pages', (wp: WP) => wp.pages.list()],
      ['categories', '/wp-json/wp/v2/categories', (wp: WP) => wp.categories.list()],
      ['tags', '/wp-json/wp/v2/tags', (wp: WP) => wp.tags.list()],
      ['media', '/wp-json/wp/v2/media', (wp: WP) => wp.media.list()],
      ['users', '/wp-json/wp/v2/users', (wp: WP) => wp.users.list()],
    ] as const)('wp.%s targets %s', async (_collection, pathname, list) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await list(wp);
      expect(lastRequestUrl(fetchMock).pathname).toBe(pathname);
    });
  });

  describe('custom post types and taxonomies', () => {
    it('postType() targets the custom post type endpoint', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://wp-api.wp-kyoto.net', fetch: fetchMock });
      await wp.postType('thoughs').list({ per_page: 20 });
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/wp/v2/thoughs');
    });

    it('normalizes leading/trailing slashes in the rest base', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await wp.postType('/events/').list();
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/wp/v2/events');
    });

    it('taxonomy() targets the custom taxonomy endpoint', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://wp-api.wp-kyoto.net', fetch: fetchMock });
      await wp.taxonomy('stripe-categories').list({ orderby: 'name', order: 'asc' });
      const url = lastRequestUrl(fetchMock);
      expect(url.pathname).toBe('/wp-json/wp/v2/stripe-categories');
      expect(url.searchParams.get('orderby')).toBe('name');
    });

    it('encodes special characters in the rest base', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await wp.postType('a?b#c').list();
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/wp/v2/a%3Fb%23c');
    });

    it('supports custom taxonomy filter params on post type queries', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await wp.postType('stripe').list({ 'stripe-categories': 12, _embed: true });
      const url = lastRequestUrl(fetchMock);
      expect(url.searchParams.get('stripe-categories')).toBe('12');
      expect(url.searchParams.get('_embed')).toBe('1');
    });
  });

  describe('search', () => {
    it('targets /wp/v2/search with type and subtype', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([{ id: 1, title: 'Hit', url: 'https://example.com/hit' }], {
          'X-WP-Total': '1',
          'X-WP-TotalPages': '1',
        })
      );
      const wp = createWPClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const result = await wp.search({ search: 'stripe', type: 'post', subtype: 'stripe' });
      const url = lastRequestUrl(fetchMock);
      expect(url.pathname).toBe('/wp-json/wp/v2/search');
      expect(url.searchParams.get('search')).toBe('stripe');
      expect(url.searchParams.get('subtype')).toBe('stripe');
      expect(result.items[0]?.id).toBe(1);
    });
  });

  describe('defaultQuery', () => {
    it('applies defaultQuery to every request', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({
        baseUrl: 'https://wp-api.wp-kyoto.net',
        fetch: fetchMock,
        defaultQuery: { 'filter[lang]': 'ja' },
      });
      await wp.posts.list({ per_page: 5 });
      expect(lastRequestUrl(fetchMock).searchParams.get('filter[lang]')).toBe('ja');
    });

    it('lets per-call query override defaultQuery', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        defaultQuery: { 'filter[lang]': 'ja' },
      });
      await wp.posts.list({ 'filter[lang]': 'en' });
      expect(lastRequestUrl(fetchMock).searchParams.get('filter[lang]')).toBe('en');
    });
  });

  describe('namespace', () => {
    it('supports a custom REST namespace', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        namespace: 'custom/v1',
      });
      await wp.posts.list();
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/custom/v1/posts');
    });

    it('keeps multi-segment namespaces intact while encoding each segment', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        namespace: 'myplugin/v1',
      });
      await wp.postType('events').list();
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/myplugin/v1/events');
    });

    it('encodes special characters in namespace segments', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const wp = createWPClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        namespace: 'my plugin/v1',
      });
      await wp.posts.list();
      expect(lastRequestUrl(fetchMock).pathname).toBe('/wp-json/my%20plugin/v1/posts');
    });
  });
});

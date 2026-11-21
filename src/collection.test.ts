import { describe, expect, it, vi } from 'vitest';
import { WPCollection } from './collection';
import type { HttpClient } from './http';

const post = (id: number) => ({ id, slug: `post-${id}` });

describe('WPCollection', () => {
  describe('list', () => {
    it('uses per_page 10 when the query omits per_page and totalPages is derived from X-WP-Total', async () => {
      const get = vi.fn().mockResolvedValue({
        data: [post(1)],
        response: new Response('[]', { headers: { 'X-WP-Total': '25' } }),
      });
      const http = { get } as unknown as HttpClient;
      const posts = new WPCollection<{ id: number }>(http, '/wp/v2/posts');

      const result = await posts.list();

      const query = get.mock.calls[0]?.[1] as URLSearchParams;
      expect(query.toString()).toBe('');
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it('throws when totalPages says there is another page but listAll would drop a missing slot', async () => {
      const get = vi.fn().mockImplementation(async (_path: string, params: URLSearchParams) => {
        const page = Number(params.get('page') ?? '1');
        const data = [post(page * 100)];
        return {
          data,
          response: new Response(JSON.stringify(data), {
            headers: {
              'X-WP-Total': '2',
              'X-WP-TotalPages': '2',
            },
          }),
        };
      });
      const http = { get } as unknown as HttpClient;
      const posts = new WPCollection<{ id: number; slug: string }>(http, '/wp/v2/posts');

      const items = await posts.listAll({ per_page: 1 });
      expect(items.map((p) => p.id)).toEqual([100, 200]);
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  describe('get', () => {
    it('throws TypeError with a descriptive message for invalid ids', async () => {
      const get = vi.fn();
      const posts = new WPCollection({ get } as unknown as HttpClient, '/wp/v2/posts');
      await expect(posts.get(0)).rejects.toThrow('Entity id must be a positive integer, got: 0');
      expect(get).not.toHaveBeenCalled();
    });
  });
});

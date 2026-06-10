import { describe, expect, it, vi } from 'vitest';
import { WPApiError } from './errors';
import { HttpClient } from './http';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('HttpClient', () => {
  describe('URL building', () => {
    it.each([
      ['https://example.com', 'https://example.com/wp-json/wp/v2/posts'],
      ['https://example.com/', 'https://example.com/wp-json/wp/v2/posts'],
      ['https://example.com/wp-json', 'https://example.com/wp-json/wp/v2/posts'],
      ['https://example.com/wp-json/', 'https://example.com/wp-json/wp/v2/posts'],
    ])('normalizes baseUrl %s', async (baseUrl, expected) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const http = new HttpClient({ baseUrl, fetch: fetchMock });
      await http.get('/wp/v2/posts');
      expect(fetchMock).toHaveBeenCalledWith(expected, expect.anything());
    });

    it('appends query parameters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.get('/wp/v2/posts', new URLSearchParams({ page: '2' }));
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/wp-json/wp/v2/posts?page=2',
        expect.anything()
      );
    });
  });

  describe('responses', () => {
    it('throws WPApiError without retrying when an OK response has an invalid JSON body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { backoffMs: 0 },
      });
      const error = await http.get('/wp/v2/posts').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WPApiError);
      expect((error as WPApiError).status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns parsed data and the raw response', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse([{ id: 1 }], { headers: { 'X-WP-Total': '1' } }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const { data, response } = await http.get<{ id: number }[]>('/wp/v2/posts');
      expect(data).toEqual([{ id: 1 }]);
      expect(response.headers.get('X-WP-Total')).toBe('1');
    });

    it('throws WPApiError with WP error details on non-OK response', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { code: 'rest_post_invalid_id', message: 'Invalid post ID.', data: { status: 404 } },
            { status: 404 }
          )
        );
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const error = await http.get('/wp/v2/posts/999').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WPApiError);
      const wpError = error as WPApiError;
      expect(wpError.status).toBe(404);
      expect(wpError.code).toBe('rest_post_invalid_id');
      expect(wpError.message).toBe('Invalid post ID.');
    });

    it('throws WPApiError even when the error body is not JSON', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: false,
      });
      const error = await http.get('/wp/v2/posts').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WPApiError);
      expect((error as WPApiError).status).toBe(502);
    });
  });

  describe('retry', () => {
    it('retries retryable status codes and succeeds', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(jsonResponse([{ id: 1 }]));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { backoffMs: 0 },
      });
      const { data } = await http.get('/wp/v2/posts');
      expect(data).toEqual([{ id: 1 }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-retryable status codes', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { backoffMs: 0 },
      });
      await expect(http.get('/wp/v2/posts')).rejects.toBeInstanceOf(WPApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries network errors up to the attempt limit', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 3, backoffMs: 0 },
      });
      await expect(http.get('/wp/v2/posts')).rejects.toThrow('fetch failed');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not retry when fetch rejects with an AbortError', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      const fetchMock = vi.fn().mockRejectedValue(abortError);
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 3, backoffMs: 1000 },
      });
      const start = Date.now();
      await expect(http.get('/wp/v2/posts')).rejects.toBe(abortError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(Date.now() - start).toBeLessThan(500);
    });

    it('does not retry when the request signal is already aborted', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('aborted'));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 3, backoffMs: 1000 },
      });
      const controller = new AbortController();
      controller.abort();
      await expect(
        http.get('/wp/v2/posts', undefined, { signal: controller.signal })
      ).rejects.toThrow('aborted');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry when retry is disabled', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: false,
      });
      await expect(http.get('/wp/v2/posts')).rejects.toBeInstanceOf(WPApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('request init', () => {
    it('passes per-request init (e.g. Next.js revalidate) to fetch', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.get('/wp/v2/posts', undefined, { next: { revalidate: 3600 } });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ next: { revalidate: 3600 } })
      );
    });

    it('merges defaultInit with per-request init', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        defaultInit: { cache: 'no-store' },
      });
      await http.get('/wp/v2/posts', undefined, { next: { revalidate: 60 } });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cache: 'no-store', next: { revalidate: 60 } })
      );
    });
  });
});

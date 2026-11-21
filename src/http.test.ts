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
      ['https://example.com/blog', 'https://example.com/blog/wp-json/wp/v2/posts'],
      ['https://example.com///', 'https://example.com/wp-json/wp/v2/posts'],
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
      expect((error as WPApiError).message).toMatch(/^Failed to parse response body as JSON:/);
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
      expect(wpError.name).toBe('WPApiError');
    });

    it('ignores non-string WP error codes in a JSON error body', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ code: 123, message: 'Broken', data: { status: 400 } }, { status: 400 })
        );
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: false,
      });
      const error = await http.get('/wp/v2/posts').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WPApiError);
      const wpError = error as WPApiError;
      expect(wpError.message).toBe('Broken');
      expect(wpError.code).toBeUndefined();
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
      expect((error as WPApiError).name).toBe('WPApiError');
      expect((error as WPApiError).message).toBe('WP API request failed with status 502');
    });

    it('keeps the generic message when the error JSON body has no string message', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ code: 'rest_error', message: 404, data: { status: 500 } }, { status: 500 })
        );
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: false,
      });
      const error = await http.get('/wp/v2/posts').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WPApiError);
      expect((error as WPApiError).message).toBe('WP API request failed with status 500');
      expect((error as WPApiError).code).toBe('rest_error');
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

    it('throws WPApiError with the retryable status when every attempt fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 3, backoffMs: 0 },
      });
      const error = await http.get('/wp/v2/posts').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WPApiError);
      expect((error as WPApiError).status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries a retryable status only until the final allowed attempt', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 2, backoffMs: 0 },
      });
      await expect(http.get('/wp/v2/posts')).rejects.toBeInstanceOf(WPApiError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws the original error when every attempt fails with a network error', async () => {
      const networkError = new TypeError('fetch failed');
      const fetchMock = vi.fn().mockRejectedValue(networkError);
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 2, backoffMs: 0 },
      });
      await expect(http.get('/wp/v2/posts')).rejects.toBe(networkError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
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

    it('waits between retry attempts when backoffMs is positive', async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse([{ id: 1 }]));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 3, backoffMs: 100 },
      });
      const resultPromise = http.get('/wp/v2/posts');
      await vi.advanceTimersByTimeAsync(75);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(150);
      await expect(resultPromise).resolves.toMatchObject({ data: [{ id: 1 }] });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      randomSpy.mockRestore();
      vi.useRealTimers();
    });

    it('stops after the configured attempt count without an extra fetch', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 2, backoffMs: 0 },
      });
      await expect(http.get('/wp/v2/posts')).rejects.toThrow('fetch failed');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchAbsolute', () => {
    it('fetches the given absolute URL without prepending baseUrl', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.fetchAbsolute('https://other.example.com/wp-json/wp/v2/posts/1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://other.example.com/wp-json/wp/v2/posts/1',
        expect.anything()
      );
    });

    it('returns the parsed JSON data', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 42, slug: 'hello' }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      const data = await http.fetchAbsolute<{ id: number; slug: string }>(
        'https://example.com/wp-json/wp/v2/posts/42'
      );
      expect(data).toEqual({ id: 42, slug: 'hello' });
    });

    it('retries retryable status codes', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ id: 1 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { backoffMs: 0 },
      });
      const data = await http.fetchAbsolute('https://example.com/wp-json/wp/v2/posts/1');
      expect(data).toEqual({ id: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry when retry is disabled', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: false,
      });
      await expect(
        http.fetchAbsolute('https://example.com/wp-json/wp/v2/posts/1')
      ).rejects.toBeInstanceOf(WPApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry on AbortError', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      const fetchMock = vi.fn().mockRejectedValue(abortError);
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        retry: { attempts: 3, backoffMs: 1000 },
      });
      const start = Date.now();
      await expect(http.fetchAbsolute('https://example.com/wp-json/wp/v2/posts/1')).rejects.toBe(
        abortError
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(Date.now() - start).toBeLessThan(500);
    });

    it('resolves root-relative URLs against the client origin', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.fetchAbsolute('/wp-json/wp/v2/posts/1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/wp-json/wp/v2/posts/1',
        expect.anything()
      );
    });

    it('resolves wp-json-relative URLs against the REST root', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 2 }));
      const http = new HttpClient({ baseUrl: 'https://example.com/wp-json', fetch: fetchMock });
      await http.fetchAbsolute('wp/v2/posts/2');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/wp-json/wp/v2/posts/2',
        expect.anything()
      );
    });

    it('does not treat a relative path containing http:// as an absolute URL', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 6 }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.fetchAbsolute('/assets/https://should-not-match');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/assets/https://should-not-match',
        expect.anything()
      );
    });

    it('resolves protocol-relative URLs against the client origin when baseUrl ends with /', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 7 }));
      const http = new HttpClient({ baseUrl: 'https://example.com/', fetch: fetchMock });
      await http.fetchAbsolute('wp/v2/posts/7');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/wp-json/wp/v2/posts/7',
        expect.anything()
      );
    });

    it('resolves protocol-relative URLs against the client origin', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 3 }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.fetchAbsolute('//cdn.example.com/wp-json/wp/v2/posts/3');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://cdn.example.com/wp-json/wp/v2/posts/3',
        expect.anything()
      );
    });

    it('passes absolute URLs through without changing scheme or host', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 4 }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.fetchAbsolute('HTTP://Other.Example.COM/wp-json/wp/v2/posts/4');
      expect(fetchMock).toHaveBeenCalledWith(
        'HTTP://Other.Example.COM/wp-json/wp/v2/posts/4',
        expect.anything()
      );
    });

    it('resolves root-relative paths when baseUrl has no trailing slash', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 5 }));
      const http = new HttpClient({ baseUrl: 'https://example.com', fetch: fetchMock });
      await http.fetchAbsolute('/wp-json/custom/v1/items');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/wp-json/custom/v1/items',
        expect.anything()
      );
    });
  });

  describe('default fetch', () => {
    it('uses globalThis.fetch when no custom fetch is provided', async () => {
      const globalFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ ok: true }) as Response);
      const http = new HttpClient({ baseUrl: 'https://example.com' });
      const data = await http.fetchAbsolute<{ ok: boolean }>(
        'https://example.com/wp-json/wp/v2/posts/1'
      );
      expect(data).toEqual({ ok: true });
      expect(globalFetch).toHaveBeenCalled();
      globalFetch.mockRestore();
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

    it('merges defaultInit when fetchAbsolute is called', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
      const http = new HttpClient({
        baseUrl: 'https://example.com',
        fetch: fetchMock,
        defaultInit: { cache: 'force-cache' },
      });
      await http.fetchAbsolute('https://example.com/wp-json/wp/v2/posts/1', {
        headers: { accept: 'application/json' },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/wp-json/wp/v2/posts/1',
        expect.objectContaining({
          cache: 'force-cache',
          headers: { accept: 'application/json' },
        })
      );
    });
  });
});

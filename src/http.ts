import { WPApiError } from './errors';

/**
 * RequestInit extended with framework-specific options that are passed
 * through to `fetch` untouched (e.g. Next.js ISR: `next: { revalidate }`).
 */
export type WPRequestInit = RequestInit & {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};

export type FetchLike = (url: string, init?: WPRequestInit) => Promise<Response>;

export type RetryConfig = {
  /** Total number of attempts including the first request. Default: 3 */
  attempts?: number;
  /** Base backoff in milliseconds, doubled per attempt with jitter. Default: 300 */
  backoffMs?: number;
  /** HTTP status codes that trigger a retry. Default: [502, 503, 504] */
  retryableStatusCodes?: readonly number[];
};

export type HttpClientOptions = {
  /** Site origin (e.g. `https://example.com`) or REST root (e.g. `https://example.com/wp-json`). */
  baseUrl: string;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Request init merged into every request (per-request init wins). */
  defaultInit?: WPRequestInit;
  /** Retry behavior for transient failures, or `false` to disable. */
  retry?: RetryConfig | false;
};

const DEFAULT_RETRY: Required<RetryConfig> = {
  attempts: 3,
  backoffMs: 300,
  retryableStatusCodes: [502, 503, 504],
};

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/wp-json') ? trimmed : `${trimmed}/wp-json`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backoffDelay = (baseMs: number, attempt: number): number => {
  // Exponential backoff with ±25% jitter to avoid thundering herd
  const jitter = 0.75 + Math.random() * 0.5;
  return baseMs * 2 ** attempt * jitter;
};

const toWPApiError = async (response: Response): Promise<WPApiError> => {
  let message = `WP API request failed with status ${response.status}`;
  let code: string | undefined;
  let data: unknown;
  try {
    const body = (await response.clone().json()) as {
      code?: string;
      message?: string;
      data?: unknown;
    };
    if (body && typeof body.message === 'string') message = body.message;
    if (body && typeof body.code === 'string') code = body.code;
    data = body?.data;
  } catch {
    // Non-JSON error body: keep the generic message
  }
  return new WPApiError(message, response.status, code, data);
};

export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultInit?: WPRequestInit;
  private readonly retry: Required<RetryConfig> | false;

  constructor(options: HttpClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.defaultInit = options.defaultInit;
    this.retry = options.retry === false ? false : { ...DEFAULT_RETRY, ...options.retry };
  }

  /**
   * Performs a GET request against the REST root and returns the parsed JSON
   * body alongside the raw Response (for pagination headers).
   */
  async get<T>(
    path: string,
    query?: URLSearchParams,
    init?: WPRequestInit
  ): Promise<{ data: T; response: Response }> {
    const queryString = query?.toString();
    const url = queryString ? `${this.baseUrl}${path}?${queryString}` : `${this.baseUrl}${path}`;
    const requestInit: WPRequestInit = { ...this.defaultInit, ...init };

    const attempts = this.retry === false ? 1 : this.retry.attempts;
    const backoffMs = this.retry === false ? 0 : this.retry.backoffMs;
    const retryableStatusCodes = this.retry === false ? [] : this.retry.retryableStatusCodes;

    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, requestInit);
      } catch (error) {
        // Network-level error: retry if attempts remain
        lastError = error;
        if (attempt === attempts - 1) throw error;
        await sleep(backoffDelay(backoffMs, attempt));
        continue;
      }

      if (!response.ok) {
        const error = await toWPApiError(response);
        const isRetryable = retryableStatusCodes.includes(response.status);
        if (isRetryable && attempt < attempts - 1) {
          lastError = error;
          await sleep(backoffDelay(backoffMs, attempt));
          continue;
        }
        throw error;
      }

      try {
        const data = (await response.json()) as T;
        return { data, response };
      } catch (error) {
        // An OK response with an unparseable body is not transient: do not retry
        const reason = error instanceof Error ? error.message : String(error);
        throw new WPApiError(`Failed to parse response body as JSON: ${reason}`, response.status);
      }
    }

    throw lastError;
  }
}

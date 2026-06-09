import { WPCollection, type WPListQuery, type WPListResult } from './collection';
import type {
  WPCategory,
  WPMedia,
  WPMediaEmbedContext,
  WPPage,
  WPPageEmbedContext,
  WPPost,
  WPPostEmbedContext,
  WPPostEmbedded,
  WPSearchResult,
  WPTag,
  WPTermEmbedContext,
  WPTermEmbedded,
  WPUser,
  WPUserEmbedContext,
} from './entities';
import { type FetchLike, HttpClient, type RetryConfig, type WPRequestInit } from './http';
import type { WPQueryValue } from './query';
import type { ResolveEntity } from './response-types';

export type WPClientConfig = {
  /** Site origin (e.g. `https://example.com`) or REST root (e.g. `https://example.com/wp-json`). */
  baseUrl: string;
  /** REST namespace. Default: `wp/v2` */
  namespace?: string;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Request init merged into every request (per-request init wins). */
  defaultInit?: WPRequestInit;
  /**
   * Query parameters merged into every request (per-call query wins).
   * Useful for site-wide parameters such as `{ 'filter[lang]': 'ja' }`.
   */
  defaultQuery?: Record<string, WPQueryValue>;
  /** Retry behavior for transient failures, or `false` to disable. */
  retry?: RetryConfig | false;
};

type EmptyQuery = Record<never, never>;

/**
 * GET-only client for the WordPress REST API.
 *
 * ```ts
 * const wp = createWPClient({ baseUrl: 'https://wp-api.wp-kyoto.net' });
 *
 * // Response types follow your query:
 * const { items } = await wp.posts.list({ _embed: true, _fields: ['id', 'title', '_embedded'] });
 * items[0]?._embedded; // typed
 * ```
 */
export class WPApiClient {
  readonly posts: WPCollection<WPPost, WPPostEmbedContext, WPPostEmbedded>;
  readonly pages: WPCollection<WPPage, WPPageEmbedContext, WPPostEmbedded>;
  readonly categories: WPCollection<WPCategory, WPTermEmbedContext, WPTermEmbedded>;
  readonly tags: WPCollection<WPTag, WPTermEmbedContext, WPTermEmbedded>;
  readonly media: WPCollection<WPMedia, WPMediaEmbedContext, WPPostEmbedded>;
  readonly users: WPCollection<WPUser, WPUserEmbedContext, Record<string, unknown>>;

  private readonly http: HttpClient;
  private readonly namespace: string;
  private readonly defaultQuery?: Record<string, WPQueryValue>;
  private readonly searchCollection: WPCollection<WPSearchResult>;

  constructor(config: WPClientConfig) {
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      fetch: config.fetch,
      defaultInit: config.defaultInit,
      retry: config.retry,
    });
    this.namespace = (config.namespace ?? 'wp/v2').replace(/^\/+|\/+$/g, '');
    this.defaultQuery = config.defaultQuery;

    this.posts = this.collection('posts');
    this.pages = this.collection('pages');
    this.categories = this.collection('categories');
    this.tags = this.collection('tags');
    this.media = this.collection('media');
    this.users = this.collection('users');
    this.searchCollection = this.collection('search');
  }

  /**
   * Returns a collection for a custom post type
   * (e.g. `wp.postType('events')` → `/wp/v2/events`).
   * Pass your own entity type for full type support:
   * `wp.postType<WPEvent>('events')`.
   */
  postType<T extends object = WPPost>(restBase: string): WPCollection<T, T, WPPostEmbedded> {
    return this.collection(restBase);
  }

  /**
   * Returns a collection for a custom taxonomy
   * (e.g. `wp.taxonomy('stripe-categories')` → `/wp/v2/stripe-categories`).
   */
  taxonomy<T extends object = WPCategory>(restBase: string): WPCollection<T, T, WPTermEmbedded> {
    return this.collection(restBase);
  }

  /**
   * Queries the `/wp/v2/search` endpoint.
   *
   * ```ts
   * const { items } = await wp.search({ search: 'stripe', type: 'post', subtype: 'stripe' });
   * ```
   */
  async search<const Q extends WPListQuery<WPSearchResult> = EmptyQuery>(
    query?: Q,
    init?: WPRequestInit
  ): Promise<
    WPListResult<ResolveEntity<WPSearchResult, WPSearchResult, Record<string, unknown>, Q>>
  > {
    return this.searchCollection.list(query, init);
  }

  private collection<
    TView extends object,
    TEmbedView extends object = TView,
    TEmbedded extends object = Record<string, unknown>,
  >(restBase: string): WPCollection<TView, TEmbedView, TEmbedded> {
    const normalizedBase = restBase.replace(/^\/+|\/+$/g, '');
    return new WPCollection<TView, TEmbedView, TEmbedded>(
      this.http,
      `/${this.namespace}/${normalizedBase}`,
      this.defaultQuery
    );
  }
}

/** Creates a GET-only WordPress REST API client. */
export const createWPClient = (config: WPClientConfig): WPApiClient => new WPApiClient(config);

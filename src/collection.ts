import type { HttpClient, WPRequestInit } from './http';
import { buildQuery, type WPQueryValue } from './query';
import type { ResolveEntity, WPContext, WPEmbedOption, WPFieldSelector } from './response-types';

/**
 * Common values for `orderby` while still accepting endpoint-specific ones.
 */
type OrderBy =
  | 'date'
  | 'id'
  | 'include'
  | 'modified'
  | 'parent'
  | 'relevance'
  | 'slug'
  | 'include_slugs'
  | 'title'
  | 'author'
  | 'name'
  | 'term_group'
  | 'description'
  | 'count'
  | (string & {});

/**
 * Query parameters shared by single-entity requests. These are the
 * parameters that change the response *shape* (see `ResolveEntity`).
 */
export type WPSingleQuery<T> = {
  context?: WPContext;
  _embed?: WPEmbedOption;
  _fields?: readonly WPFieldSelector<T>[];
  password?: string;
} & Record<string, WPQueryValue>;

/**
 * Query parameters for collection (list) requests. Unknown keys are allowed
 * and passed through as-is, so custom taxonomy filters
 * (e.g. `{ 'stripe-categories': 12 }`) or plugin parameters
 * (e.g. `{ 'filter[lang]': 'ja' }`) work without extra ceremony.
 */
export type WPListQuery<T> = WPSingleQuery<T> & {
  page?: number;
  per_page?: number;
  offset?: number;
  search?: string;
  order?: 'asc' | 'desc';
  orderby?: OrderBy;
  include?: readonly number[];
  exclude?: readonly number[];
  slug?: string | readonly string[];
  after?: Date | string;
  before?: Date | string;
  modified_after?: Date | string;
  modified_before?: Date | string;
  author?: number | readonly number[];
  parent?: number | readonly number[];
  categories?: number | readonly number[];
  tags?: number | readonly number[];
  status?: string | readonly string[];
  sticky?: boolean;
  hide_empty?: boolean;
  post?: number;
};

export type WPListResult<T> = {
  items: T[];
  /** Value of the `X-WP-Total` header (falls back to `items.length`). */
  total: number;
  /** Value of the `X-WP-TotalPages` header (falls back to `1`). */
  totalPages: number;
};

type EmptyQuery = Record<never, never>;

const DEFAULT_LIST_ALL_PER_PAGE = 100;
// Cap on parallel page requests in listAll, to avoid tripping rate limits
// or exhausting sockets on large collections.
const LIST_ALL_CONCURRENCY = 5;

const intHeader = (response: Response, name: string, fallback: number): number => {
  const raw = response.headers.get(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * A GET-only handle for one REST collection (posts, pages, a custom post
 * type, a taxonomy, ...). The response type of every method follows the
 * query you pass (`_fields`, `_embed`, `context`).
 */
export class WPCollection<
  TView extends object,
  TEmbedView extends object = TView,
  TEmbedded extends object = Record<string, unknown>,
> {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
    private readonly defaultQuery?: Record<string, WPQueryValue>
  ) {}

  /** Lists entities with pagination info from the `X-WP-Total*` headers. */
  async list<const Q extends WPListQuery<TView> = EmptyQuery>(
    query?: Q,
    init?: WPRequestInit
  ): Promise<WPListResult<ResolveEntity<TView, TEmbedView, TEmbedded, Q>>> {
    type Item = ResolveEntity<TView, TEmbedView, TEmbedded, Q>;
    const params = buildQuery({ ...this.defaultQuery, ...query });
    const { data, response } = await this.http.get<Item[]>(this.path, params, init);
    return {
      items: data,
      total: intHeader(response, 'X-WP-Total', data.length),
      totalPages: intHeader(response, 'X-WP-TotalPages', 1),
    };
  }

  /**
   * Fetches every page of the collection and concatenates the results.
   * The first page determines the total page count; remaining pages are
   * fetched in parallel.
   */
  async listAll<const Q extends WPListQuery<TView> = EmptyQuery>(
    query?: Q,
    init?: WPRequestInit
  ): Promise<ResolveEntity<TView, TEmbedView, TEmbedded, Q>[]> {
    type Item = ResolveEntity<TView, TEmbedView, TEmbedded, Q>;
    const perPage =
      (query as { per_page?: number } | undefined)?.per_page ?? DEFAULT_LIST_ALL_PER_PAGE;
    const pageQuery = (page: number) =>
      ({ ...query, per_page: perPage, page }) as WPListQuery<TView>;

    const firstPage = await this.list(pageQuery(1), init);
    const items = [...firstPage.items] as Item[];

    if (firstPage.totalPages > 1) {
      const restPageCount = firstPage.totalPages - 1;
      const results = new Array<Item[]>(restPageCount);
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < restPageCount) {
          const index = nextIndex++;
          const page = await this.list(pageQuery(index + 2), init);
          results[index] = page.items as Item[];
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(LIST_ALL_CONCURRENCY, restPageCount) }, worker)
      );
      for (const pageItems of results) {
        items.push(...pageItems);
      }
    }

    return items;
  }

  /** Retrieves a single entity by ID. Throws `WPApiError` when not found. */
  async get<const Q extends WPSingleQuery<TView> = EmptyQuery>(
    id: number,
    query?: Q,
    init?: WPRequestInit
  ): Promise<ResolveEntity<TView, TEmbedView, TEmbedded, Q>> {
    type Item = ResolveEntity<TView, TEmbedView, TEmbedded, Q>;
    const params = buildQuery({ ...this.defaultQuery, ...query });
    const { data } = await this.http.get<Item>(`${this.path}/${id}`, params, init);
    return data;
  }

  /** Finds a single entity by slug. Returns `null` when nothing matches. */
  async getBySlug<const Q extends WPSingleQuery<TView> = EmptyQuery>(
    slug: string,
    query?: Q,
    init?: WPRequestInit
  ): Promise<ResolveEntity<TView, TEmbedView, TEmbedded, Q> | null> {
    type Item = ResolveEntity<TView, TEmbedView, TEmbedded, Q>;
    const { items } = await this.list({ ...query, slug, per_page: 1 } as WPListQuery<TView>, init);
    return (items[0] as Item | undefined) ?? null;
  }
}

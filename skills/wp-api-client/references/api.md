# node-wp-api-client — API reference

All symbols are exported from the package root (`node-wp-api-client`).

## Functions and classes

| Export | Kind | Purpose |
| --- | --- | --- |
| `createWPClient(config)` | function | Creates a `WPApiClient` (preferred entry point) |
| `WPApiClient` | class | The client; holds collections and `postType` / `taxonomy` / `search` |
| `WPCollection<TView, TEmbedView, TEmbedded>` | class | One REST collection; `list` / `listAll` / `get` / `getBySlug` |
| `WPApiError` | class | Thrown on non-OK responses; `status`, `code?`, `data?` |
| `buildQuery(query)` | function | Serializes a query object to `URLSearchParams` (WP conventions) |

## `WPClientConfig`

```ts
type WPClientConfig = {
  baseUrl: string;                            // origin or '.../wp-json'
  namespace?: string;                         // default 'wp/v2'
  fetch?: FetchLike;                          // default globalThis.fetch
  defaultInit?: WPRequestInit;                // merged into every fetch (per-request wins)
  defaultQuery?: Record<string, WPQueryValue>; // merged into every request (per-call wins)
  retry?: RetryConfig | false;                // default { attempts: 3, backoffMs: 300 }
};
```

## Query types

`WPSingleQuery<T>` (for `get` / `getBySlug`) — the parameters that change the
response shape, plus arbitrary pass-through keys:

```ts
{
  context?: 'view' | 'embed' | 'edit';
  _embed?: boolean | string | readonly string[];
  _fields?: readonly WPFieldSelector<T>[];   // validated against T
  password?: string;
} & Record<string, WPQueryValue>
```

`WPListQuery<T>` (for `list` / `listAll`) extends it with:
`page`, `per_page`, `offset`, `search`, `order` (`'asc' | 'desc'`), `orderby`,
`include`, `exclude`, `slug`, `after`, `before`, `modified_after`,
`modified_before` (Date or string), `author`, `parent`, `categories`, `tags`,
`status`, `sticky`, `hide_empty`, `post`.

`WPQueryValue` = `string | number | boolean | Date | readonly (string | number)[] | null | undefined`.

`WPListResult<T>` = `{ items: T[]; total: number; totalPages: number }`
(`total` / `totalPages` from `X-WP-Total` / `X-WP-TotalPages` headers).

## Type-level resolution

```ts
type ResolveEntity<TView, TEmbedView, TEmbedded, Q>
```

Applies, in order: `Q extends { context: 'embed' }` → `TEmbedView`;
`Q extends { _embed: ... }` → intersect `{ _embedded: TEmbedded }`;
`Q extends { _fields: [...] }` → `Pick` of the top-level field heads
(`'_links.wp:term'` → `'_links'`).

`WPFieldSelector<T>` accepts top-level keys of `T`, nested paths
(`'title.rendered'`), `'_embedded'`, and `'_embedded.*'`.

## Entity types (context=view)

- `WPPost` — `id`, `date`, `date_gmt`, `guid`, `modified`, `modified_gmt`,
  `slug`, `status`, `type`, `link`, `title` (`WPRendered`), `content` /
  `excerpt` (`WPRenderedContent`), `author`, `featured_media`,
  `comment_status`, `ping_status`, `sticky`, `template`, `format`, `meta`,
  `categories: number[]`, `tags: number[]`, `_links`
- `WPPage` — like `WPPost` minus `sticky`/`format`/`categories`/`tags`, plus
  `parent`, `menu_order`
- `WPCategory` — `id`, `count`, `description`, `link`, `name`, `slug`,
  `taxonomy`, `parent`, `meta`, `_links`
- `WPTag` — `WPCategory` without `parent`
- `WPMedia` — post-like fields plus `description`, `caption`, `alt_text`,
  `media_type`, `mime_type`, `media_details` (`WPMediaDetails`, includes
  `sizes: Record<string, WPMediaSize>`), `post: number | null`, `source_url`
- `WPUser` — `id`, `name`, `url`, `description`, `link`, `slug`,
  `avatar_urls: Record<string, string>`, `meta`, `_links`
- `WPSearchResult` — `id`, `title: string` (not rendered!), `url`, `type`
  (`'post' | 'term' | 'post-format'` + open), `subtype`, `_links`

Building blocks: `WPRendered` (`{ rendered: string }`), `WPRenderedContent`
(adds `protected?`), `WPLink`, `WPLinks`, `WPPostStatus`, `WPMediaSize`,
`WPMediaDetails`.

## Embed-context entities (returned for `context: 'embed'`)

`WPPostEmbedContext`, `WPPageEmbedContext`, `WPTermEmbedContext`,
`WPMediaEmbedContext`, `WPUserEmbedContext` — `Pick`s of the full entities
(e.g. posts keep `id`, `date`, `slug`, `type`, `link`, `title`, `excerpt`,
`author`, `featured_media`, `_links`).

## `_embedded` payload types (added by `_embed`)

```ts
type WPPostEmbedded = {
  author?: WPEmbeddedAuthor[];
  'wp:term'?: WPEmbeddedTerm[][];          // array per taxonomy
  'wp:featuredmedia'?: WPEmbeddedMedia[];
};

type WPTermEmbedded = { up?: WPTermEmbedContext[] }; // parent terms
```

Used by posts/pages/media (`WPPostEmbedded`) and categories/tags
(`WPTermEmbedded`). `users` has no typed `_embedded` payload.

## Collection generics

`wp.postType<T>(restBase)` → `WPCollection<T, T, WPPostEmbedded>` —
note `context: 'embed'` does not reduce custom types (TEmbedView = T).
`wp.taxonomy<T>(restBase)` → `WPCollection<T, T, WPTermEmbedded>`.

## Behavior notes

- `get(id)` validates `id` is a positive safe integer (throws `TypeError`
  otherwise) and throws `WPApiError` on HTTP errors (404 included).
- `getBySlug(slug)` is `list({ slug, per_page: 1 })` under the hood; returns
  `null` on no match.
- `listAll` fetches page 1, then remaining pages with concurrency 5; default
  `per_page` 100.
- Retries (default on): 502/503/504 and network errors, exponential backoff
  with jitter; configure via `retry` or disable with `retry: false`.

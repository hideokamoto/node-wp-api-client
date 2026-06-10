---
name: wp-api-client
description: >-
  Guide for fetching WordPress content in TypeScript/Node.js with the
  node-wp-api-client npm package — a type-safe, GET-only WordPress REST API
  client where response types follow the query (_fields, _embed, context).
  Use when writing or reviewing code that reads posts, pages, terms, media,
  users, custom post types, or taxonomies from the WordPress REST API
  (wp-json/wp/v2), or when the user mentions node-wp-api-client.
---

# node-wp-api-client

Type-safe, **GET-only** WordPress REST API client for Node.js 20.19+ and edge
runtimes (Cloudflare Workers, etc.). It cannot create or update content — for
writes, use authenticated `fetch` calls or another tool.

```bash
npm install node-wp-api-client
```

```ts
import { createWPClient } from 'node-wp-api-client';

const wp = createWPClient({ baseUrl: 'https://example.com' }); // origin or .../wp-json
```

## The core rule: response types follow the query

The WP REST API changes its response **shape** based on `_fields`, `_embed`,
and `context`. This library mirrors that at the type level, so **never add
manual casts or redundant type annotations** — write the query and let the
return type follow. No `as const` is needed (methods infer `const Q`).

```ts
// WPPost[]
const { items } = await wp.posts.list({ per_page: 10 });

// Pick<WPPost, 'id' | 'title' | 'slug'>[]
const { items: slim } = await wp.posts.list({ _fields: ['id', 'title', 'slug'] });

// (WPPost & { _embedded: WPPostEmbedded })[]
const { items: embedded } = await wp.posts.list({ _embed: true });
embedded[0]?._embedded?.['wp:term']; // fully typed

// context: 'embed' → reduced entity (e.g. WPPostEmbedContext)
const { items: brief } = await wp.posts.list({ context: 'embed' });
```

Transformations apply in this order (matching the server):
`context: 'embed'` switches to the reduced entity → `_embed` intersects
`{ _embedded }` → `_fields` `Pick`s the listed **top-level** fields (a nested
path like `'_links.wp:term'` selects its top-level key `_links`).

Pitfall: when combining `_embed` with `_fields`, `'_embedded'` must be listed
in `_fields` or the server strips it (and the type reflects that):

```ts
const { items: cards } = await wp.posts.list({
  _embed: true,
  _fields: ['_links.wp:term', '_embedded', 'id', 'slug', 'title', 'excerpt', 'date'],
});
```

`_fields` entries are validated against the entity type — typos are compile
errors and the editor suggests known field names.

## Collections and methods

Built-in collections: `wp.posts`, `wp.pages`, `wp.categories`, `wp.tags`,
`wp.media`, `wp.users`. Each exposes the same four GET methods:

```ts
const { items, total, totalPages } = await wp.posts.list({ page: 2, per_page: 10 });
const all = await wp.posts.listAll({ categories: [5] }); // fetches every page (parallel, returns T[])
const post = await wp.posts.get(123, { _embed: true });  // throws WPApiError on 404
const bySlug = await wp.posts.getBySlug('hello-world');  // returns null when not found
```

- `total` / `totalPages` come from the `X-WP-Total` / `X-WP-TotalPages` headers.
- `listAll` returns a plain array (no `total`), defaults to `per_page: 100`.
- Note the different not-found behavior: `get` **throws**, `getBySlug` returns **null**.

## Custom post types, taxonomies, search

```ts
// /wp/v2/case-studies — defaults to the WPPost shape
const caseStudies = wp.postType('case-studies');

// Bring your own entity type (e.g. ACF fields) for full _fields/type support
type WPEvent = WPPost & { acf: { venue: string } };
const events = wp.postType<WPEvent>('events');
const { items } = await events.list({ _fields: ['id', 'title', 'acf'] });

// /wp/v2/stripe-categories — defaults to the WPCategory shape
const stripeCategories = wp.taxonomy('stripe-categories');
const category = await stripeCategories.getBySlug('billing');

// /wp/v2/search
const { items: hits } = await wp.search({ search: 'stripe', type: 'post', subtype: 'stripe' });
```

Unknown query keys pass through as-is, so custom taxonomy filters and plugin
parameters need no extra ceremony:

```ts
await wp.postType('stripe').list({ 'stripe-categories': category.id, _embed: true });
await wp.posts.list({ 'filter[lang]': 'en' });
```

## Client configuration

```ts
const wp = createWPClient({
  baseUrl: 'https://example.com',          // required; origin or '.../wp-json'
  namespace: 'wp/v2',                      // default
  defaultQuery: { 'filter[lang]': 'ja' },  // merged into every request (per-call wins)
  defaultInit: { cache: 'no-store' },      // merged into every fetch call
  retry: { attempts: 3, backoffMs: 300 },  // default; pass `false` to disable
  fetch: customFetch,                      // defaults to globalThis.fetch
});
```

Transient failures (502/503/504 and network errors) retry with exponential
backoff and jitter by default — don't add your own retry loop.

Every method accepts a `RequestInit` as its **last** argument, passed straight
to `fetch`. Use this for framework caching (Next.js, etc.):

```ts
await wp.posts.list({ per_page: 20 }, { next: { revalidate: 1800 } });
```

## Query serialization

Handled by the library — do not pre-stringify values:
arrays → comma-separated (`categories: [1, 2]` → `categories=1,2`),
`Date` → ISO 8601, `_embed: true` → `_embed=1`, `_embed: 'wp:term'` or
`['author', 'wp:term']` → scoped embed, `null`/`undefined`/empty arrays are
omitted.

## Error handling

```ts
import { WPApiError } from 'node-wp-api-client';

try {
  await wp.posts.get(999999);
} catch (error) {
  if (error instanceof WPApiError) {
    error.status; // 404
    error.code;   // 'rest_post_invalid_id'
    error.data;   // raw error data from the response body
  }
}
```

## Reference

For the full list of exported entity types (`WPPost`, `WPPage`, `WPCategory`,
`WPTag`, `WPMedia`, `WPUser`, `WPSearchResult`, embed-context and `_embedded`
shapes) and query parameter types, read [references/api.md](references/api.md).

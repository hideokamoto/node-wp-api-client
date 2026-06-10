# node-wp-api-client

Type-safe WordPress REST API client for Node.js / edge runtimes (GET only).

The WP REST API changes its **response shape** depending on the query you send
(`_fields`, `_embed`, `context`). This SDK mirrors those rules at the type
level, so the return type of every call follows the query you wrote — no
manual casts, no `as const` required.

```ts
import { createWPClient } from 'node-wp-api-client';

const wp = createWPClient({ baseUrl: 'https://wp-api.wp-kyoto.net' });

// Full WPPost
const { items } = await wp.posts.list({ per_page: 10 });

// Pick<WPPost, 'id' | 'title' | 'slug'> — the type follows _fields
const { items: slim } = await wp.posts.list({ _fields: ['id', 'title', 'slug'] });

// WPPost & { _embedded: WPPostEmbedded } — _embed adds _embedded to the type
const { items: embedded } = await wp.posts.list({ _embed: true });
embedded[0]?._embedded?.['wp:term']; // fully typed

// Combine them, exactly like the WP API requires
const { items: cards } = await wp.posts.list({
  _embed: true,
  _fields: ['_links.wp:term', '_embedded', 'id', 'slug', 'title', 'excerpt', 'date'],
});
```

## Install

```bash
npm install node-wp-api-client
```

Requires Node.js 20.19+ (or 22.12+). Works on Cloudflare Workers and other
edge runtimes with a native `fetch`.

## Creating a client

```ts
const wp = createWPClient({
  baseUrl: 'https://example.com',          // site origin or '.../wp-json'
  namespace: 'wp/v2',                      // default
  defaultQuery: { 'filter[lang]': 'ja' },  // merged into every request
  defaultInit: { cache: 'no-store' },      // merged into every fetch call
  retry: { attempts: 3, backoffMs: 300 },  // default; `false` to disable
});
```

Transient failures (502/503/504 and network errors) are retried with
exponential backoff and jitter by default.

### Framework caching (Next.js, etc.)

Every method accepts a `RequestInit` as its last argument, passed straight to
`fetch`:

```ts
await wp.posts.list({ per_page: 20 }, { next: { revalidate: 1800 } });
```

## Collections

`posts`, `pages`, `categories`, `tags`, `media`, and `users` are built in.
Each collection exposes the same four GET methods:

```ts
const { items, total, totalPages } = await wp.posts.list({ page: 2, per_page: 10 });
const all = await wp.posts.listAll({ categories: [5] }); // fetches every page
const post = await wp.posts.get(123, { _embed: true });  // throws WPApiError on 404
const bySlug = await wp.posts.getBySlug('hello-world');  // null when not found
```

`total` / `totalPages` come from the `X-WP-Total` / `X-WP-TotalPages` headers.
`listAll` always paginates from page 1 and overrides any `page` you pass;
`per_page` is respected (default `100`).

### Custom post types & taxonomies

```ts
// /wp/v2/case-studies
const caseStudies = wp.postType('case-studies');
await caseStudies.list({ per_page: 20, _embed: 'wp:term' });

// Bring your own entity type
type WPEvent = WPPost & { acf: { venue: string } };
const events = wp.postType<WPEvent>('events');
const { items } = await events.list({ _fields: ['id', 'title', 'acf'] });

// /wp/v2/stripe-categories
const stripeCategories = wp.taxonomy('stripe-categories');
const category = await stripeCategories.getBySlug('billing');
```

Unknown query keys are passed through as-is, so custom taxonomy filters and
plugin parameters just work:

```ts
await wp.postType('stripe').list({ 'stripe-categories': category.id, _embed: true });
await wp.posts.list({ 'filter[lang]': 'en' });
```

### Search

```ts
const { items } = await wp.search({ search: 'stripe', type: 'post', subtype: 'stripe' });
```

## How the response types work

`ResolveEntity` applies the same transformations the server does, in order:

1. `context: 'embed'` → switches to the reduced embed-context entity
2. `_embed` → intersects `{ _embedded: ... }` into the entity
3. `_fields` → `Pick`s the listed top-level fields (nested paths such as
   `_links.wp:term` select their top-level key)

`_fields` entries are validated against the entity, so typos are caught at
compile time, and known field names are suggested by your editor.

## Error handling

```ts
import { WPApiError } from 'node-wp-api-client';

try {
  await wp.posts.get(999999);
} catch (error) {
  if (error instanceof WPApiError) {
    error.status; // 404
    error.code;   // 'rest_post_invalid_id'
  }
}
```

## Agent skill (Claude Code)

This repo ships an [agent skill](skills/wp-api-client/SKILL.md) that teaches
Claude Code how to use this library. Install it as a plugin:

```
/plugin marketplace add hideokamoto/node-wp-api-client
/plugin install wp-api-client@node-wp-api-client
```

The skill is also published inside the npm package (`skills/`), so you can
copy or symlink it into your project instead:

```bash
mkdir -p .claude/skills
cp -r node_modules/node-wp-api-client/skills/wp-api-client .claude/skills/
```

## Development

```bash
npm install
npm test            # unit tests + type-level tests (vitest --typecheck)
npm run typecheck   # tsc --noEmit
npm run lint        # biome check
npm run build       # vite (ESM + CJS) + tsc declarations
```

## License

MIT

/**
 * Type-level machinery that resolves the response shape from the request query.
 *
 * The WP REST API changes its response shape based on query parameters:
 * - `_fields=id,title`     → only the listed (top-level) fields are returned
 * - `_embed` / `_embed=1`  → an `_embedded` object is added
 * - `context=embed`        → a reduced field set is returned
 * - `context=edit`         → rendered fields include `raw` (and users gain edit-only fields)
 *
 * `ResolveEntity` mirrors those rules at the type level so the return type of
 * each client method follows the query you wrote — without manual casts.
 */

/** Accepted values for the `_embed` query parameter. */
export type WPEmbedOption = boolean | string | readonly string[];

/** Accepted values for the `context` query parameter (GET requests). */
export type WPContext = 'view' | 'embed' | 'edit';

/**
 * Valid entries for `_fields`. Top-level keys of the entity are suggested,
 * and nested paths such as `_links.wp:term` or `_embedded.author` are allowed.
 */
export type WPFieldSelector<T> =
  | (keyof T & string)
  | `${keyof T & string}.${string}`
  | '_embedded'
  | `_embedded.${string}`;

/** `'_links.wp:term'` → `'_links'`, `'id'` → `'id'` */
type FieldHead<F extends string> = F extends `${infer Head}.${string}` ? Head : F;

type ApplyContext<TView, TEmbedView, TEditView, Q> = Q extends { context: 'embed' }
  ? TEmbedView
  : Q extends { context: 'edit' }
    ? TEditView
    : TView;

type ApplyEmbed<T, TEmbedded, Q> = Q extends { _embed: true | string | readonly string[] }
  ? T & { _embedded: TEmbedded }
  : T;

type ApplyFields<T, Q> = Q extends { _fields: readonly (infer F extends string)[] }
  ? Pick<T, Extract<FieldHead<F>, keyof T>>
  : T;

/**
 * Computes the entity shape returned by the API for a given query `Q`.
 *
 * - `TView`      — the full entity (context=view)
 * - `TEmbedView` — the reduced entity (context=embed)
 * - `TEmbedded`  — the `_embedded` payload added by `_embed`
 * - `TEditView`  — the editable entity (context=edit)
 */
export type ResolveEntity<TView, TEmbedView, TEmbedded, TEditView, Q> = ApplyFields<
  ApplyEmbed<ApplyContext<TView, TEmbedView, TEditView, Q>, TEmbedded, Q>,
  Q
>;

/** Values that can be serialized into a WP REST API query string. */
export type WPQueryValue =
  | string
  | number
  | boolean
  | Date
  | readonly (string | number)[]
  | null
  | undefined;

/**
 * Serializes a query object into URLSearchParams following WP REST API
 * conventions: arrays become comma-separated lists, Dates become ISO 8601
 * strings, and `_embed: true` becomes `_embed=1`.
 */
export const buildQuery = (query?: Record<string, WPQueryValue>): URLSearchParams => {
  const params = new URLSearchParams();
  if (!query) return params;

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (key === '_embed') {
      if (value === false) continue;
      if (value === true) {
        params.set('_embed', '1');
        continue;
      }
      params.set('_embed', Array.isArray(value) ? value.join(',') : String(value));
      continue;
    }

    if (value instanceof Date) {
      params.set(key, value.toISOString());
      continue;
    }

    if (Array.isArray(value)) {
      params.set(key, value.join(','));
      continue;
    }

    params.set(key, String(value));
  }

  return params;
};

/**
 * WordPress REST API entity types (context=view shapes).
 */

export type WPRendered = {
  rendered: string;
};

export type WPRenderedContent = {
  rendered: string;
  protected?: boolean;
};

/** Rendered field shape returned when `context=edit` is requested. */
export type WPEditRendered = {
  raw: string;
  rendered: string;
};

/** Content/excerpt field shape returned when `context=edit` is requested. */
export type WPEditRenderedContent = {
  raw: string;
  rendered: string;
  protected?: boolean;
};

/** Content field shape returned when `context=edit` is requested on posts/pages. */
export type WPEditPostContent = WPEditRenderedContent & {
  block_version: number;
};

/**
 * Maps view-context rendered fields to their edit-context counterparts.
 * Useful for custom post types that extend `WPPost`-like shapes.
 *
 * Only top-level keys whose type is `WPRendered` or `WPRenderedContent` are
 * transformed — nested rendered fields (e.g. inside ACF objects) are not.
 */
export type MapEditContextFields<T> = {
  [K in keyof T]: T[K] extends WPRenderedContent
    ? WPEditRenderedContent
    : T[K] extends WPRendered
      ? WPEditRendered
      : T[K];
};

export type WPLink = {
  href: string;
  embeddable?: boolean;
  [key: string]: unknown;
};

export type WPLinks = Record<string, WPLink[]>;

export type WPLinkRelation =
  | 'self'
  | 'collection'
  | 'about'
  | 'author'
  | 'wp:term'
  | 'wp:featuredmedia'
  | 'wp:attachment'
  | 'wp:post-type'
  | 'up'
  | 'curies'
  | (string & {});

/**
 * Returns all links for the given relation from an entity's `_links` object.
 * Returns an empty array when the relation is absent or `entity` is nullish.
 *
 * ```ts
 * const termLinks = getLinks(post, 'wp:term');
 * ```
 */
export function getLinks(
  entity: { _links?: WPLinks } | null | undefined,
  relation: WPLinkRelation
): WPLink[] {
  const links = entity?._links?.[relation];
  return Array.isArray(links) ? links : [];
}

/**
 * Returns the first link for the given relation from an entity's `_links` object,
 * or `undefined` when the relation is absent or `entity` is nullish.
 *
 * ```ts
 * const selfLink = getFirstLink(post, 'self');
 * if (selfLink) {
 *   const same = await wp.fetchLink<WPPost>(selfLink);
 * }
 * ```
 */
export function getFirstLink(
  entity: { _links?: WPLinks } | null | undefined,
  relation: WPLinkRelation
): WPLink | undefined {
  return entity?._links?.[relation]?.[0];
}

export type WPRoute = {
  namespace: string;
  methods: string[];
  endpoints: Array<{ methods: string[]; args: Record<string, unknown> }>;
  _links?: { self: Array<{ href: string }> };
};

export type WPRootResponse = {
  name: string;
  description: string;
  url: string;
  home: string;
  gmt_offset: number;
  timezone_string: string;
  namespaces: string[];
  authentication: Record<string, unknown>;
  routes: Record<string, WPRoute>;
  _links?: WPLinks;
};

export type WPPostStatus = 'publish' | 'future' | 'draft' | 'pending' | 'private' | (string & {});

export type WPPost = {
  id: number;
  date: string;
  date_gmt: string;
  guid: WPRendered;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: WPPostStatus;
  type: string;
  link: string;
  title: WPRendered;
  content: WPRenderedContent;
  excerpt: WPRenderedContent;
  author: number;
  featured_media: number;
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  sticky: boolean;
  template: string;
  format: string;
  meta: Record<string, unknown>;
  categories: number[];
  tags: number[];
  _links: WPLinks;
};

export type WPPage = {
  id: number;
  date: string;
  date_gmt: string;
  guid: WPRendered;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: WPPostStatus;
  type: string;
  link: string;
  title: WPRendered;
  content: WPRenderedContent;
  excerpt: WPRenderedContent;
  author: number;
  featured_media: number;
  parent: number;
  menu_order: number;
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  template: string;
  meta: Record<string, unknown>;
  _links: WPLinks;
};

export type WPCategory = {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
  meta: Record<string, unknown>;
  _links: WPLinks;
};

export type WPTag = {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  meta: Record<string, unknown>;
  _links: WPLinks;
};

export type WPMediaSize = {
  file: string;
  width: number;
  height: number;
  mime_type: string;
  source_url: string;
};

export type WPMediaDetails = {
  width?: number;
  height?: number;
  file?: string;
  sizes?: Record<string, WPMediaSize>;
  image_meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WPMedia = {
  id: number;
  date: string;
  date_gmt: string;
  guid: WPRendered;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: WPPostStatus;
  type: string;
  link: string;
  title: WPRendered;
  author: number;
  comment_status: 'open' | 'closed';
  ping_status: 'open' | 'closed';
  template: string;
  meta: Record<string, unknown>;
  description: WPRendered;
  caption: WPRendered;
  alt_text: string;
  media_type: 'image' | 'file' | (string & {});
  mime_type: string;
  media_details: WPMediaDetails;
  post: number | null;
  source_url: string;
  _links: WPLinks;
};

export type WPUser = {
  id: number;
  name: string;
  url: string;
  description: string;
  link: string;
  slug: string;
  avatar_urls: Record<string, string>;
  meta: Record<string, unknown>;
  _links: WPLinks;
};

export type WPSearchResult = {
  id: number;
  title: string;
  url: string;
  type: 'post' | 'term' | 'post-format' | (string & {});
  subtype: string;
  _links: WPLinks;
};

/**
 * Reduced entity shapes returned when `context=embed` is requested.
 */
export type WPPostEmbedContext = Pick<
  WPPost,
  | 'id'
  | 'date'
  | 'slug'
  | 'type'
  | 'link'
  | 'title'
  | 'excerpt'
  | 'author'
  | 'featured_media'
  | '_links'
>;

export type WPPageEmbedContext = Pick<
  WPPage,
  | 'id'
  | 'date'
  | 'slug'
  | 'type'
  | 'link'
  | 'title'
  | 'excerpt'
  | 'author'
  | 'featured_media'
  | 'parent'
  | '_links'
>;

export type WPTermEmbedContext = Pick<
  WPCategory,
  'id' | 'link' | 'name' | 'slug' | 'taxonomy' | '_links'
>;

export type WPMediaEmbedContext = Pick<
  WPMedia,
  | 'id'
  | 'date'
  | 'slug'
  | 'type'
  | 'link'
  | 'title'
  | 'author'
  | 'caption'
  | 'alt_text'
  | 'media_type'
  | 'mime_type'
  | 'media_details'
  | 'source_url'
  | '_links'
>;

export type WPUserEmbedContext = Pick<
  WPUser,
  'id' | 'name' | 'url' | 'description' | 'link' | 'slug' | 'avatar_urls' | '_links'
>;

/**
 * Entity shapes returned when `context=edit` is requested.
 */
export type WPPostEditContext = Omit<MapEditContextFields<WPPost>, 'content'> & {
  content: WPEditPostContent;
  permalink_template: string;
  generated_slug: string;
};

export type WPPageEditContext = Omit<MapEditContextFields<WPPage>, 'content'> & {
  content: WPEditPostContent;
  permalink_template: string;
  generated_slug: string;
};

export type WPMediaEditContext = MapEditContextFields<WPMedia> & {
  filename: string;
  filesize: number | null;
  missing_image_sizes: string[];
};

/**
 * User entity in edit context. Includes the most common edit-only fields
 * exposed by the WP REST API; the full schema may include additional keys
 * (e.g. plugin meta) not listed here.
 */
export type WPUserEditContext = WPUser & {
  username: string;
  email: string;
  registered_date: string;
  roles: string[];
  capabilities: Record<string, boolean>;
  extra_capabilities: Record<string, boolean>;
  locale: string;
  nickname: string;
  first_name: string;
  last_name: string;
};

/**
 * `_embedded` payload shapes added when `_embed` is requested.
 */
export type WPEmbeddedTerm = {
  id: number;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  _links?: WPLinks;
};

export type WPEmbeddedAuthor = {
  id: number;
  name: string;
  url: string;
  description: string;
  link: string;
  slug: string;
  avatar_urls: Record<string, string>;
  _links?: WPLinks;
};

export type WPEmbeddedMedia = {
  id: number;
  date: string;
  slug: string;
  type: string;
  link: string;
  title: WPRendered;
  author: number;
  caption?: WPRendered;
  alt_text?: string;
  media_type: string;
  mime_type: string;
  media_details?: WPMediaDetails;
  source_url: string;
  _links?: WPLinks;
};

export type WPPostEmbedded = {
  author?: WPEmbeddedAuthor[];
  'wp:term'?: WPEmbeddedTerm[][];
  'wp:featuredmedia'?: WPEmbeddedMedia[];
};

export type WPTermEmbedded = {
  up?: WPTermEmbedContext[];
};

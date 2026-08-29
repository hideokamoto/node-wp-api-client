# Changelog

All notable changes to this project will be documented in this file.

## 0.3.0

### Added

- `context: 'edit'` type resolution in `ResolveEntity` — rendered fields include `raw`
  (`WPEditRendered`, `WPEditRenderedContent`, `WPEditPostContent`,
  `MapEditContextFields`, and built-in edit-context entity types including
  `permalink_template`, `generated_slug`, and media file metadata)
- Fourth generic `TEditView` on `WPCollection` (defaults to `MapEditContextFields<TView>`)
- Context-aware `_fields` validation: when `context: 'edit'` is set, field names are
  validated against the edit-context entity (e.g. `email` on users)

### Changed

- **`ResolveEntity` signature** — a fourth type parameter `TEditView` was added:

  ```ts
  // before
  ResolveEntity<TView, TEmbedView, TEmbedded, Q>
  // after
  ResolveEntity<TView, TEmbedView, TEmbedded, TEditView, Q>
  ```

- **`WPSingleQuery` / `WPListQuery` signatures** — now accept an optional second type
  parameter `TEditView` (defaults to `TView`):

  ```ts
  // before
  WPSingleQuery<T>
  WPListQuery<T>
  // after
  WPSingleQuery<TView, TEditView>
  WPListQuery<TView, TEditView>
  ```

### Notes

- `MapEditContextFields` only transforms top-level `WPRendered` / `WPRenderedContent`
  keys; nested rendered fields inside custom objects are not mapped automatically.

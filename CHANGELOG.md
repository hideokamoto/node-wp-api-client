# Changelog

## [0.2.0](https://github.com/hideokamoto/node-wp-api-client/compare/v0.1.0...v0.2.0) (2026-06-10)


### Features

* bundle Claude Code agent skill in the npm package ([966c262](https://github.com/hideokamoto/node-wp-api-client/commit/966c262))

### Bug Fixes

* derive totalPages from total/per_page when X-WP-TotalPages header is absent ([df26a6e](https://github.com/hideokamoto/node-wp-api-client/commit/df26a6e))
* do not retry aborted requests; omit empty arrays from query strings ([cf75df7](https://github.com/hideokamoto/node-wp-api-client/commit/cf75df7))
* read per_page from built params to include defaultQuery contribution ([548e0e6](https://github.com/hideokamoto/node-wp-api-client/commit/548e0e6))
* validate entity IDs and encode path segments to prevent URL path manipulation ([0ebfafd](https://github.com/hideokamoto/node-wp-api-client/commit/0ebfafd))

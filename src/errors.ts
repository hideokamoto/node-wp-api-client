/**
 * Error thrown when the WP REST API responds with a non-OK status.
 * Carries the HTTP status and, when available, the WP error code
 * (e.g. `rest_post_invalid_id`) and error data from the response body.
 */
export class WPApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly data?: unknown;

  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = 'WPApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

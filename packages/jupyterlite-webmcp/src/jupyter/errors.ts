/**
 * Structured error codes that every WebMCP tool may report. Keeping this as a
 * closed union lets callers (and the LLM agent reading tool results) branch
 * on `error` reliably instead of parsing free-form messages.
 */
export type ErrorCode =
  | 'NO_ACTIVE_NOTEBOOK'
  | 'NOTEBOOK_NOT_FOUND'
  | 'CELL_NOT_FOUND'
  | 'STALE_CELL'
  | 'INVALID_PATH'
  | 'PATH_EXISTS'
  | 'INVALID_CELL_TYPE'
  | 'INVALID_ARGUMENT'
  | 'KERNEL_UNAVAILABLE'
  | 'EXECUTION_ERROR'
  | 'ABORTED'
  | 'WEBMCP_UNAVAILABLE'
  | 'COMMENT_NOT_FOUND'
  | 'COMMENT_ANCHOR_STALE'
  | 'CELL_ACCESS_DENIED'
  | 'INTERNAL_ERROR';

/**
 * The plain-JSON shape every normalized error is reduced to before it is
 * placed into a tool result's `structuredContent`. Additional diagnostic
 * fields may be present alongside `error` and `message`.
 */
export interface IStructuredError {
  error: ErrorCode;
  message: string;
  [key: string]: unknown;
}

/**
 * The exception type thrown by tool implementations for any expected,
 * user-facing failure (as opposed to an unexpected internal bug). Carries a
 * closed `code`, a human-readable `message`, and optional structured
 * `details` that get merged into the serialized error.
 */
export class ToolError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    // Fix the prototype chain: TS compiles classes extending built-ins like
    // Error down to ES5-compatible code when targeting older runtimes, which
    // otherwise breaks `instanceof ToolError` checks.
    Object.setPrototypeOf(this, ToolError.prototype);
    this.name = 'ToolError';
    this.code = code;
    this.details = details ?? {};
  }

  /**
   * Reduces this error to a plain JSON-serializable object. `error` and
   * `message` always reflect this error's own `code`/`message`, even if
   * `details` happens to contain keys with those names.
   */
  toJSON(): IStructuredError {
    const merged: IStructuredError = {
      ...this.details,
      error: this.code,
      message: this.message
    };
    merged.error = this.code;
    merged.message = this.message;
    return merged;
  }
}

/**
 * Constructs a {@link ToolError}. A small convenience so call sites can
 * `throw toolError(...)` without repeating `new`.
 */
export function toolError(code: ErrorCode, message: string, details?: Record<string, unknown>): ToolError {
  return new ToolError(code, message, details);
}

/**
 * Returns true when `err` represents an aborted operation: either a
 * DOMException-like object with `name === 'AbortError'`, or a {@link ToolError}
 * whose code is `'ABORTED'`.
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof ToolError) {
    return err.code === 'ABORTED';
  }
  if (err && typeof err === 'object' && 'name' in err) {
    return (err as { name?: unknown }).name === 'AbortError';
  }
  return false;
}

/**
 * Reduces any thrown value to a plain {@link IStructuredError}, safe to embed
 * in a tool result. Aborts normalize to `ABORTED`; {@link ToolError}s use
 * their own `toJSON`; other `Error`s and non-Error values normalize to
 * `INTERNAL_ERROR` with a message truncated to 500 characters and never
 * expose a stack trace.
 */
export function normalizeError(err: unknown): IStructuredError {
  if (isAbortError(err)) {
    return { error: 'ABORTED', message: 'The tool invocation was aborted.' };
  }
  if (err instanceof ToolError) {
    return err.toJSON();
  }
  if (err instanceof Error) {
    return { error: 'INTERNAL_ERROR', message: err.message.slice(0, 500) };
  }
  return { error: 'INTERNAL_ERROR', message: String(err).slice(0, 500) };
}

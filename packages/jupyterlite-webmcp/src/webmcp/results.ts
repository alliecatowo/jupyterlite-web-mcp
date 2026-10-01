/**
 * Helpers for building the tool-result envelopes returned to a WebMCP
 * client: bounding oversized JSON payloads and wrapping successful or
 * failed tool outcomes into the `{content, structuredContent}` shape.
 */
import { LIMITS } from '../limits';
import type { IStructuredError } from '../jupyter/errors';
import { truncateUtf8, utf8Length } from '../utf8';

/**
 * One block of a tool result's `content` array. Only plain text blocks are
 * produced by this module.
 */
export interface IToolResultContent {
  type: 'text';
  text: string;
}

/**
 * The envelope returned by every WebMCP tool call: a list of text content
 * blocks for display, optional machine-readable `structuredContent`, and an
 * `isError` flag when the call failed.
 */
export interface IToolResult {
  content: IToolResultContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** One array in a payload that may be trimmed, with the object holding it. */
interface ITrimCandidate {
  parent: JsonObject;
  key: string;
  bytes: number;
}

/**
 * Every non-empty array of objects held by a plain-object property anywhere
 * in `value`. Arrays of strings or numbers (such as an nbformat
 * `text: string[]`) are never candidates: trimming them would silently change
 * content rather than drop whole items.
 */
function trimCandidates(
  value: unknown,
  out: ITrimCandidate[] = []
): ITrimCandidate[] {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      trimCandidates(value[i], out);
    }
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (
        Array.isArray(child) &&
        child.length > 0 &&
        child.every(item => isPlainObject(item))
      ) {
        out.push({
          parent: value,
          key,
          bytes: utf8Length(JSON.stringify(child))
        });
      }
      trimCandidates(child, out);
    }
  }
  return out;
}

/**
 * Tries to make `root` fit in `maxBytes` by dropping trailing items of its
 * largest arrays of objects, one array at a time. The object holding a
 * trimmed array gets `truncated: true` and its `omittedCount` increased by
 * the number of items dropped (an existing count is added to, never
 * overwritten); the root also gets `truncated: true`. Mutates `root`, and
 * returns its serialized form when it fits, otherwise `null`.
 */
function trimToFit(root: JsonObject, maxBytes: number): string | null {
  const done = new Set<unknown>();
  for (let round = 0; round < 8; round++) {
    const candidates = trimCandidates(root).filter(
      c => !done.has(c.parent[c.key])
    );
    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => b.bytes - a.bytes);
    const { parent, key } = candidates[0];
    const items = parent[key] as unknown[];
    const baseOmitted =
      typeof parent.omittedCount === 'number' ? parent.omittedCount : 0;
    const apply = (keep: number): string => {
      const kept = items.slice(0, keep);
      parent[key] = kept;
      done.add(kept);
      parent.truncated = true;
      parent.omittedCount = baseOmitted + (items.length - keep);
      root.truncated = true;
      return JSON.stringify(root);
    };
    // The largest number of leading items that fits, by binary search. The
    // whole array is known not to fit (the current state does not).
    let lo = 0;
    let hi = items.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (utf8Length(apply(mid)) <= maxBytes) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const text = apply(best === -1 ? 0 : best);
    if (best !== -1) {
      return text;
    }
    // Even an empty array does not fit: something else is large too, so
    // move on to the next largest array.
  }
  return null;
}

/**
 * Serializes `value` to compact JSON, bounding the result to at most
 * `maxBytes` of UTF-8 (defaulting to {@link LIMITS.MAX_TOTAL_RESULT_BYTES}).
 *
 * When the serialized value fits, returns it unchanged. Otherwise, for an
 * object payload, it first degrades gracefully: trailing items of the
 * largest arrays of objects are dropped until the result fits, and the
 * trimmed copy is returned as `value` alongside its JSON `text`. The agent
 * still gets well-formed, structured items (with their ids and hashes), plus
 * `truncated: true` and an `omittedCount` on the object that held the
 * trimmed array. The caller's `value` is never mutated.
 *
 * Only when that is impossible (no trimmable array, or what remains is still
 * too large) does it fall back to a small JSON envelope carrying the longest
 * prefix of the original JSON whose re-escaped form still fits, as an opaque
 * `partial` string, with no `value`. The returned `text` is always valid
 * JSON and never exceeds `maxBytes` (for any `maxBytes` large enough to hold
 * the envelope itself).
 */
export function boundJson(
  value: unknown,
  maxBytes: number = LIMITS.MAX_TOTAL_RESULT_BYTES
): { text: string; truncated: boolean; value?: unknown } {
  const json = JSON.stringify(value);
  if (utf8Length(json) <= maxBytes) {
    return { text: json, truncated: false };
  }
  if (isPlainObject(value)) {
    const copy = JSON.parse(json) as JsonObject;
    const text = trimToFit(copy, maxBytes);
    if (text !== null) {
      return { text, truncated: true, value: copy };
    }
  }
  // The `partial` string is re-escaped when the envelope is serialized
  // (every `"`, `\`, newline or control character in `json` grows), so
  // its length is chosen by the byte size of the *final* envelope, by
  // binary search over the prefix budget, never by a fixed margin.
  const envelopeText = (budget: number): string =>
    JSON.stringify({
      truncated: true,
      reason: 'Result exceeded the maximum tool result size.',
      maxBytes,
      partial: truncateUtf8(json, budget)
    });
  let lo = 0;
  let hi = maxBytes;
  let best = envelopeText(0);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const text = envelopeText(mid);
    if (utf8Length(text) <= maxBytes) {
      best = text;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { text: best, truncated: true };
}

/**
 * Builds a successful tool result for `payload`: a single bounded-JSON text
 * block plus the same payload (or its trimmed copy) as `structuredContent`
 * whenever it is still well-formed (see below).
 */
export function okResult(payload: unknown): IToolResult {
  const bounded = boundJson(payload);
  const result: IToolResult = {
    content: [{ type: 'text', text: bounded.text }]
  };
  // `structuredContent` is a convenience copy of the same payload. When the
  // payload had to be trimmed to fit, it is the trimmed copy (identical to
  // the text). When it could only be reduced to an opaque `partial` notice,
  // it is omitted: attaching the unbounded original here would reintroduce
  // exactly the size the bound exists to prevent.
  if (!bounded.truncated) {
    result.structuredContent = payload;
  } else if (bounded.value !== undefined) {
    result.structuredContent = bounded.value;
  }
  return result;
}

/** Marker appended to an error string that was clamped. */
const CLAMP_MARKER = '…[truncated]';

/**
 * `value` with every string longer than `maxBytes` of UTF-8 cut to fit
 * (marker included). Returns `value` itself when nothing needed cutting,
 * otherwise a copy; the input is never mutated.
 */
function clampStrings(value: unknown, maxBytes: number): unknown {
  if (typeof value === 'string') {
    if (utf8Length(value) <= maxBytes) {
      return value;
    }
    const budget = Math.max(0, maxBytes - utf8Length(CLAMP_MARKER));
    return truncateUtf8(value, budget) + CLAMP_MARKER;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(item => {
      const next = clampStrings(item, maxBytes);
      changed = changed || next !== item;
      return next;
    });
    return changed ? out : value;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const out: JsonObject = {};
    for (const key of Object.keys(value)) {
      const next = clampStrings(value[key], maxBytes);
      changed = changed || next !== value[key];
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
}

/**
 * Builds a failed tool result for a normalized structured error: a single
 * JSON text block, `structuredContent` set to the same (bounded) error, and
 * `isError: true`.
 *
 * Errors often echo the caller's own input (a cell id, an enum value), so
 * every string in the error is clamped to
 * {@link LIMITS.MAX_ERROR_STRING_BYTES} of UTF-8; the `error` code itself is
 * never altered. If the clamped error is still over
 * {@link LIMITS.MAX_TOTAL_RESULT_BYTES} (say, a long array of echoed ids),
 * both the text and `structuredContent` fall back to `{error, message}`.
 */
export function errorResult(err: IStructuredError): IToolResult {
  let bounded = clampStrings(
    err,
    LIMITS.MAX_ERROR_STRING_BYTES
  ) as IStructuredError;
  if (bounded !== err) {
    bounded.error = err.error;
  }
  let text = JSON.stringify(bounded);
  if (utf8Length(text) > LIMITS.MAX_TOTAL_RESULT_BYTES) {
    bounded = { error: err.error, message: bounded.message };
    text = JSON.stringify(bounded);
  }
  return {
    content: [{ type: 'text', text }],
    structuredContent: bounded,
    isError: true
  };
}

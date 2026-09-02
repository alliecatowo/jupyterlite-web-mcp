/**
 * Helpers for building the tool-result envelopes returned to a WebMCP
 * client: bounding oversized JSON payloads and wrapping successful or
 * failed tool outcomes into the `{content, structuredContent}` shape.
 */
import { LIMITS } from '../limits';
import type { IStructuredError } from '../jupyter/errors';

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

function utf8Length(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
        continue;
      }
    }
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function slicePartial(json: string, maxBytes: number): string {
  let bytes = 0;
  let result = '';
  let i = 0;
  while (i < json.length) {
    const code = json.charCodeAt(i);
    let charLen = 1;
    let byteLen: number;
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < json.length) {
      const next = json.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        charLen = 2;
        byteLen = 4;
      } else {
        byteLen = 3;
      }
    } else if (code < 0x80) {
      byteLen = 1;
    } else if (code < 0x800) {
      byteLen = 2;
    } else {
      byteLen = 3;
    }
    if (bytes + byteLen > maxBytes) {
      break;
    }
    bytes += byteLen;
    result += json.substr(i, charLen);
    i += charLen;
  }
  return result;
}

/**
 * Serializes `value` to compact JSON, bounding the result to at most
 * `maxBytes` of UTF-8 (defaulting to {@link LIMITS.MAX_TOTAL_RESULT_BYTES}).
 * When the serialized value fits, returns it unchanged. Otherwise returns a
 * small JSON envelope describing the truncation, containing only the first
 * `maxBytes - 300` UTF-8 bytes of the original JSON (cut at a character
 * boundary) as `partial`. The returned `text` is always valid JSON.
 */
export function boundJson(value: unknown, maxBytes: number = LIMITS.MAX_TOTAL_RESULT_BYTES): { text: string; truncated: boolean } {
  const json = JSON.stringify(value);
  if (utf8Length(json) <= maxBytes) {
    return { text: json, truncated: false };
  }
  const partialBudget = Math.max(0, maxBytes - 300);
  const partial = slicePartial(json, partialBudget);
  const envelope = {
    truncated: true,
    reason: 'Result exceeded the maximum tool result size.',
    maxBytes,
    partial
  };
  return { text: JSON.stringify(envelope), truncated: true };
}

/**
 * Builds a successful tool result for `payload`: a single bounded-JSON text
 * block plus the unbounded `payload` as `structuredContent`.
 */
export function okResult(payload: unknown): IToolResult {
  return {
    content: [{ type: 'text', text: boundJson(payload).text }],
    structuredContent: payload
  };
}

/**
 * Builds a failed tool result for a normalized structured error: a single
 * bounded-JSON text block, `structuredContent` set to the error, and
 * `isError: true`.
 */
export function errorResult(err: IStructuredError): IToolResult {
  return {
    content: [{ type: 'text', text: boundJson(err).text }],
    structuredContent: err,
    isError: true
  };
}

/**
 * Small UTF-8 helpers for byte-bounded limits (see `src/limits.ts`). They
 * walk UTF-16 code units directly so they work without `TextEncoder` and
 * never split a surrogate pair.
 */

/** Length of one character starting at `i`: UTF-16 code units and UTF-8 bytes. */
function charAt(str: string, i: number): { units: number; bytes: number } {
  const code = str.charCodeAt(i);
  if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
    const next = str.charCodeAt(i + 1);
    if (next >= 0xdc00 && next <= 0xdfff) {
      return { units: 2, bytes: 4 };
    }
  }
  if (code < 0x80) {
    return { units: 1, bytes: 1 };
  }
  if (code < 0x800) {
    return { units: 1, bytes: 2 };
  }
  return { units: 1, bytes: 3 };
}

/** UTF-8 byte length of `str`. */
export function utf8Length(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length;) {
    const c = charAt(str, i);
    bytes += c.bytes;
    i += c.units;
  }
  return bytes;
}

/**
 * The longest prefix of `str` that fits in `maxBytes` of UTF-8, cut at a
 * character boundary (a surrogate pair is never split).
 */
export function truncateUtf8(str: string, maxBytes: number): string {
  let bytes = 0;
  let i = 0;
  while (i < str.length) {
    const c = charAt(str, i);
    if (bytes + c.bytes > maxBytes) {
      break;
    }
    bytes += c.bytes;
    i += c.units;
  }
  return str.slice(0, i);
}

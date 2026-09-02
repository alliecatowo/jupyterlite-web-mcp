import { okResult, errorResult, boundJson } from '../../src/webmcp/results';
import type { IStructuredError } from '../../src/jupyter/errors';

describe('okResult with an oversized payload', () => {
  it('omits structuredContent rather than reintroducing the unbounded payload', () => {
    const huge = { rows: new Array(20000).fill('x'.repeat(64)) };
    const result = okResult(huge);
    expect(result.structuredContent).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.truncated).toBe(true);
  });

  it('keeps structuredContent when the payload fits', () => {
    const small = { ok: true };
    const result = okResult(small);
    expect(result.structuredContent).toEqual(small);
  });
});

describe('okResult', () => {
  it('produces a single text content block and structuredContent equal to the payload', () => {
    const payload = { foo: 'bar', n: 1 };
    const result = okResult(payload);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(payload);
    expect(result.structuredContent).toBe(payload);
    expect(result.isError).toBeUndefined();
  });
});

describe('errorResult', () => {
  it('sets isError: true and mirrors the error into structuredContent', () => {
    const err: IStructuredError = { error: 'INTERNAL_ERROR', message: 'boom' };
    const result = errorResult(err);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBe(err);
    expect(JSON.parse(result.content[0].text)).toEqual(err);
  });
});

describe('boundJson', () => {
  it('returns valid, unmodified JSON for a small payload', () => {
    const payload = { a: 1, b: [1, 2, 3] };
    const { text, truncated } = boundJson(payload);
    expect(truncated).toBe(false);
    expect(JSON.parse(text)).toEqual(payload);
  });

  it('returns valid, truncated JSON for an oversized payload', () => {
    const bigArray = new Array(5000).fill('x'.repeat(50));
    const { text, truncated } = boundJson({ items: bigArray }, 1024);
    expect(truncated).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.truncated).toBe(true);
    expect(typeof parsed.partial).toBe('string');
    expect(parsed.maxBytes).toBe(1024);
  });

  it('keeps the truncated envelope itself within a reasonable size', () => {
    const bigArray = new Array(5000).fill('x'.repeat(50));
    const { text } = boundJson({ items: bigArray }, 1024);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(1024 + 50);
  });
});

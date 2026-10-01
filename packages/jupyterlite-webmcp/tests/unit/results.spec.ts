import { okResult, errorResult, boundJson } from '../../src/webmcp/results';
import type { IStructuredError } from '../../src/jupyter/errors';

describe('okResult with an oversized payload', () => {
  it('omits structuredContent when only an opaque partial notice fits', () => {
    const huge = { rows: new Array(20000).fill('x'.repeat(64)) };
    const result = okResult(huge);
    expect(result.structuredContent).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.truncated).toBe(true);
    expect(typeof parsed.partial).toBe('string');
  });

  it('returns the trimmed copy as structuredContent, identical to the text', () => {
    const cells = Array.from({ length: 20 }, (_, i) => ({
      id: `cell-${i}`,
      sourceHash: `hash-${i}`,
      source: 'y'.repeat(25 * 1024)
    }));
    const payload = { cells, truncated: false, omittedCount: 0 };
    const result = okResult(payload);
    expect(result.structuredContent).toBeDefined();
    expect(JSON.parse(result.content[0].text)).toEqual(
      result.structuredContent
    );
    const sc = result.structuredContent as typeof payload;
    expect(sc.truncated).toBe(true);
    expect(sc.cells.length).toBeGreaterThan(0);
    expect(sc.cells.length + sc.omittedCount).toBe(20);
    expect(sc.cells[0].sourceHash).toBe('hash-0');
    // The caller's payload is not mutated.
    expect(payload.cells).toHaveLength(20);
    expect(payload.truncated).toBe(false);
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

  it('falls back to a partial envelope when there is no array of objects to trim', () => {
    const bigArray = new Array(5000).fill('x'.repeat(50));
    const { text, truncated, value } = boundJson({ items: bigArray }, 1024);
    expect(truncated).toBe(true);
    expect(value).toBeUndefined();
    const parsed = JSON.parse(text);
    expect(parsed.truncated).toBe(true);
    expect(typeof parsed.partial).toBe('string');
    expect(parsed.maxBytes).toBe(1024);
  });

  it('drops a single oversized item, reporting it, rather than going opaque', () => {
    const { text, value } = boundJson(
      { id: 'x', items: [{ s: 'z'.repeat(5000) }] },
      1024
    );
    expect(JSON.parse(text)).toEqual({
      id: 'x',
      items: [],
      truncated: true,
      omittedCount: 1
    });
    expect(value).toEqual(JSON.parse(text));
  });

  it('falls back to a partial envelope when what is left is still too large', () => {
    const { text, value } = boundJson(
      { s: 'z'.repeat(5000), items: [{ a: 1 }] },
      1024
    );
    expect(value).toBeUndefined();
    expect(typeof JSON.parse(text).partial).toBe('string');
  });

  it('trims trailing items of the largest array and stays within maxBytes', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      i,
      s: 'x'.repeat(100)
    }));
    const small = [{ keep: true }];
    const { text, truncated, value } = boundJson(
      { items, small, note: 'n' },
      2048
    );
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(2048);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(value);
    expect(parsed.truncated).toBe(true);
    expect(parsed.small).toEqual(small);
    expect(parsed.note).toBe('n');
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items.map((item: { i: number }) => item.i)).toEqual(
      Array.from({ length: parsed.items.length }, (_, i) => i)
    );
    expect(parsed.omittedCount).toBe(50 - parsed.items.length);
  });

  it('adds to an existing omittedCount rather than overwriting it', () => {
    const threads = Array.from({ length: 30 }, (_, i) => ({
      i,
      s: 'x'.repeat(100)
    }));
    const parsed = JSON.parse(
      boundJson({ threads, truncated: true, omittedCount: 7 }, 1500).text
    );
    expect(parsed.omittedCount).toBe(7 + 30 - parsed.threads.length);
  });

  it('marks the parent of a nested trimmed array and the root', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({
      i,
      body: 'm'.repeat(100)
    }));
    const parsed = JSON.parse(
      boundJson(
        { notebookPath: 'a.ipynb', thread: { id: 't', messages } },
        1500
      ).text
    );
    expect(parsed.truncated).toBe(true);
    expect(parsed.thread.truncated).toBe(true);
    expect(parsed.thread.omittedCount).toBe(40 - parsed.thread.messages.length);
    expect(parsed.notebookPath).toBe('a.ipynb');
  });

  it('never trims arrays of strings', () => {
    const output = { text: new Array(300).fill('line\n') };
    const { value } = boundJson({ output }, 1024);
    expect(value).toBeUndefined();
  });

  it('keeps the truncated envelope itself within a reasonable size', () => {
    const bigArray = new Array(5000).fill('x'.repeat(50));
    const { text } = boundJson({ items: bigArray }, 1024);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(1024 + 50);
  });
});

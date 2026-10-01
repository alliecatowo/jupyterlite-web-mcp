import {
  offsetAt,
  positionAt,
  textInRange,
  makeSourceAnchor,
  resolveSourceAnchor
} from '../../src/review/anchors';
import type { IAnchor, IPosition, ISourceRange } from '../../src/review/model';
import { LIMITS } from '../../src/limits';

const MULTILINE = 'first line\nsecond line here\nthird\n';

describe('offsetAt / positionAt round trip', () => {
  const positions: IPosition[] = [
    { line: 0, column: 0 },
    { line: 0, column: 5 },
    { line: 1, column: 0 },
    { line: 1, column: 7 },
    { line: 2, column: 5 }
  ];

  it.each(positions)('round-trips %o', pos => {
    const offset = offsetAt(MULTILINE, pos);
    expect(positionAt(MULTILINE, offset)).toEqual(pos);
  });

  it('clamps an out-of-range line rather than throwing', () => {
    expect(() => offsetAt(MULTILINE, { line: 999, column: 0 })).not.toThrow();
    const offset = offsetAt(MULTILINE, { line: 999, column: 0 });
    expect(offset).toBeLessThanOrEqual(MULTILINE.length);
  });

  it('clamps an out-of-range column rather than throwing', () => {
    expect(() => offsetAt(MULTILINE, { line: 0, column: 9999 })).not.toThrow();
    const offset = offsetAt(MULTILINE, { line: 0, column: 9999 });
    expect(offset).toBe('first line'.length);
  });

  it('clamps a negative line/column rather than throwing', () => {
    expect(() => offsetAt(MULTILINE, { line: -5, column: -5 })).not.toThrow();
    expect(offsetAt(MULTILINE, { line: -5, column: -5 })).toBe(0);
  });
});

describe('textInRange', () => {
  it('extracts the expected substring', () => {
    const range: ISourceRange = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 6 }
    };
    expect(textInRange(MULTILINE, range)).toBe('second');
  });
});

describe('makeSourceAnchor', () => {
  const source = 'before context here\nTARGET\nafter context here';
  const range: ISourceRange = {
    start: { line: 1, column: 0 },
    end: { line: 1, column: 6 }
  };

  it('captures selectedText, a non-empty hash, and prefix/suffix context', () => {
    const anchor = makeSourceAnchor('cell-1', source, range);
    expect(anchor.kind).toBe('source-range');
    expect(anchor.cellId).toBe('cell-1');
    expect(anchor.selectedText).toBe('TARGET');
    expect(anchor.selectedTextHash).toEqual(expect.any(String));
    expect(anchor.selectedTextHash!.length).toBeGreaterThan(0);
    expect(anchor.prefix).toBe('before context here\n');
    expect(anchor.suffix).toBe('\nafter context here');
  });
});

describe('makeSourceAnchor with an oversized selection', () => {
  const max = LIMITS.MAX_SELECTED_TEXT_BYTES;

  function expectConsistent(source: string, range: ISourceRange) {
    const anchor = makeSourceAnchor('cell-1', source, range);
    const text = anchor.selectedText!;
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(max);
    expect(text.length).toBeGreaterThan(0);
    // Never ends on a lone high surrogate.
    const last = text.charCodeAt(text.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    // The stored range covers exactly the stored text, and the suffix
    // follows it directly.
    expect(textInRange(source, anchor.sourceRange!)).toBe(text);
    const end = source.indexOf(text) + text.length;
    const after = source.slice(end, end + LIMITS.MAX_ANCHOR_CONTEXT);
    expect(anchor.suffix).toBe(after);
    const resolved = resolveSourceAnchor(anchor, source);
    expect(resolved.state).toBe('exact');
    expect(resolved.text).toBe(text);
    return anchor;
  }

  it('clamps a long multibyte selection by bytes and still resolves exact', () => {
    // 3000 characters of 3-byte text: under the old character clamp, over
    // the byte bound.
    const body = 'é日'.repeat(1500);
    const source = `head\n${body}\ntail`;
    const anchor = expectConsistent(source, {
      start: { line: 1, column: 0 },
      end: { line: 1, column: body.length }
    });
    expect(anchor.selectedText!.length).toBeLessThan(body.length);
  });

  it('never splits an emoji pair at the cut', () => {
    // 4095 ASCII bytes then emoji: the next 4-byte pair cannot fit.
    const body = 'a'.repeat(max - 1) + '😀'.repeat(10);
    const source = `${body}\nrest`;
    const anchor = expectConsistent(source, {
      start: { line: 0, column: 0 },
      end: { line: 0, column: body.length }
    });
    expect(anchor.selectedText).toBe('a'.repeat(max - 1));
  });

  it('handles a reversed range spanning several lines', () => {
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`line ${i} ${'x'.repeat(60)}`);
    }
    const source = lines.join('\n');
    expectConsistent(source, {
      start: { line: 99, column: 10 },
      end: { line: 2, column: 3 }
    });
  });

  it('keeps the original range untouched when nothing is clamped', () => {
    const source = 'abc\ndef';
    const range: ISourceRange = {
      start: { line: 1, column: 2 },
      end: { line: 0, column: 1 }
    };
    expect(makeSourceAnchor('c', source, range).sourceRange).toBe(range);
  });
});

describe('resolveSourceAnchor', () => {
  it('returns exact when the source is unchanged', () => {
    const source = 'before context here\nTARGET\nafter context here';
    const range: ISourceRange = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 6 }
    };
    const anchor = makeSourceAnchor('cell-1', source, range);
    const resolved = resolveSourceAnchor(anchor, source);
    expect(resolved.state).toBe('exact');
    expect(resolved.range).toEqual(range);
    expect(resolved.text).toBe('TARGET');
  });

  it('returns reanchored, pointing at the new location, when a line is inserted above', () => {
    const original = 'line1\ntarget text here\nline3';
    const range: ISourceRange = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 16 }
    };
    const anchor = makeSourceAnchor('cell-1', original, range);

    const updated = 'inserted\nline1\ntarget text here\nline3';
    const resolved = resolveSourceAnchor(anchor, updated);

    expect(resolved.state).toBe('reanchored');
    expect(resolved.text).toBe('target text here');
    expect(resolved.range).toEqual({
      start: { line: 2, column: 0 },
      end: { line: 2, column: 16 }
    });
  });

  it('returns orphaned when the anchored text was deleted from the cell', () => {
    const original = 'line1\ntarget text here\nline3';
    const range: ISourceRange = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 16 }
    };
    const anchor = makeSourceAnchor('cell-1', original, range);

    const updated = 'line1\nline3';
    const resolved = resolveSourceAnchor(anchor, updated);
    expect(resolved.state).toBe('orphaned');
  });

  it('returns orphaned when the text appears twice and the context is ambiguous', () => {
    const anchor: IAnchor = {
      kind: 'source-range',
      cellId: 'cell-1',
      sourceRange: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 6 }
      },
      selectedText: 'TARGET',
      prefix: '',
      suffix: ''
    };
    const source = 'xxx TARGET yyy TARGET zzz';
    const resolved = resolveSourceAnchor(anchor, source);
    expect(resolved.state).toBe('orphaned');
  });

  it('returns reanchored pointing at the right occurrence when prefix disambiguates', () => {
    const source = 'xxx TARGET yyy TARGET zzz';
    // "yyy " uniquely precedes the second occurrence of TARGET.
    const anchor: IAnchor = {
      kind: 'source-range',
      cellId: 'cell-1',
      sourceRange: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 6 }
      },
      selectedText: 'TARGET',
      prefix: 'yyy ',
      suffix: ''
    };
    const resolved = resolveSourceAnchor(anchor, source);
    expect(resolved.state).toBe('reanchored');
    const secondOccurrenceOffset = source.indexOf(
      'TARGET',
      source.indexOf('TARGET') + 1
    );
    expect(resolved.range).toEqual({
      start: positionAtHelper(source, secondOccurrenceOffset),
      end: positionAtHelper(source, secondOccurrenceOffset + 'TARGET'.length)
    });
  });

  it('returns orphaned for an anchor with no selectedText', () => {
    const anchor: IAnchor = {
      kind: 'source-range',
      cellId: 'cell-1'
    };
    const resolved = resolveSourceAnchor(anchor, 'any source here');
    expect(resolved.state).toBe('orphaned');
  });

  it('returns orphaned for an anchor with an empty selectedText', () => {
    const anchor: IAnchor = {
      kind: 'source-range',
      cellId: 'cell-1',
      selectedText: ''
    };
    const resolved = resolveSourceAnchor(anchor, 'any source here');
    expect(resolved.state).toBe('orphaned');
  });
});

function positionAtHelper(source: string, offset: number): IPosition {
  return positionAt(source, offset);
}

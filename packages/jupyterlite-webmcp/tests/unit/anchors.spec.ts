import {
  offsetAt,
  positionAt,
  textInRange,
  makeSourceAnchor,
  resolveSourceAnchor
} from '../../src/review/anchors';
import type { IAnchor, IPosition, ISourceRange } from '../../src/review/model';

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

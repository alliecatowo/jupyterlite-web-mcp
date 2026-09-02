import { diffLines, diffStats, hasDiffChanges } from '../../src/activity/diff';

describe('diffLines', () => {
  it('returns all-context lines for identical input', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc');
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'context', text: 'c' }
    ]);
    expect(hasDiffChanges(lines)).toBe(false);
  });

  it('treats null/undefined as empty strings', () => {
    expect(diffLines(null, undefined)).toEqual([]);
    expect(diffLines(undefined, 'a')).toEqual([{ kind: 'added', text: 'a' }]);
    expect(diffLines('a', null)).toEqual([{ kind: 'removed', text: 'a' }]);
  });

  it('keeps unchanged lines as context around a single-line edit', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc');
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'B' },
      { kind: 'context', text: 'c' }
    ]);
  });

  it('reports a pure insertion as added-only', () => {
    const lines = diffLines('a\nc', 'a\nb\nc');
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'added', text: 'b' },
      { kind: 'context', text: 'c' }
    ]);
  });

  it('reports a pure deletion as removed-only', () => {
    const lines = diffLines('a\nb\nc', 'a\nc');
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'context', text: 'c' }
    ]);
  });

  it('falls back to a coarse remove-all/add-all diff above the line bound', () => {
    const before = new Array(500).fill('same').join('\n');
    const after = new Array(500).fill('same').concat(['different']).join('\n');
    const lines = diffLines(before, after);
    expect(lines.filter(l => l.kind === 'removed')).toHaveLength(500);
    expect(lines.filter(l => l.kind === 'added')).toHaveLength(501);
  });

  it('never throws on pathological input', () => {
    expect(() => diffLines('', '')).not.toThrow();
    expect(() => diffLines('\n\n\n', '')).not.toThrow();
  });
});

describe('diffStats', () => {
  it('counts added and removed lines only', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
  });

  it('is zero for an unchanged diff', () => {
    expect(diffStats(diffLines('x', 'x'))).toEqual({ added: 0, removed: 0 });
  });
});

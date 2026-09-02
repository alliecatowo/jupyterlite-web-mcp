import { stableHash, hashCellSource, computeNotebookRevision } from '../../src/jupyter/revisions';

describe('stableHash', () => {
  it('is deterministic for the same input', () => {
    expect(stableHash('hello world')).toBe(stableHash('hello world'));
  });

  it('returns 16 lowercase hex characters', () => {
    const hash = stableHash('some content');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces distinct hashes for distinct inputs', () => {
    const inputs = ['a', 'b', 'abc', 'abcd', 'The quick brown fox'];
    const hashes = inputs.map(stableHash);
    expect(new Set(hashes).size).toBe(inputs.length);
  });

  it('is stable for the empty string', () => {
    const hash = stableHash('');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(stableHash('')).toBe(hash);
  });
});

describe('hashCellSource', () => {
  it('distinguishes cell type', () => {
    expect(hashCellSource('code', 'x')).not.toBe(hashCellSource('markdown', 'x'));
  });

  it('is deterministic', () => {
    expect(hashCellSource('code', 'print(1)')).toBe(hashCellSource('code', 'print(1)'));
  });
});

describe('computeNotebookRevision', () => {
  const cellA = { id: 'c1', cellType: 'code', source: 'print(1)' };
  const cellB = { id: 'c2', cellType: 'markdown', source: '# hi' };

  it('starts with rev_', () => {
    expect(computeNotebookRevision([cellA, cellB])).toMatch(/^rev_[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    expect(computeNotebookRevision([cellA, cellB])).toBe(computeNotebookRevision([cellA, cellB]));
  });

  it('changes when a cell source changes', () => {
    const changed = { ...cellA, source: 'print(2)' };
    expect(computeNotebookRevision([cellA, cellB])).not.toBe(computeNotebookRevision([changed, cellB]));
  });

  it('changes when cell order changes', () => {
    expect(computeNotebookRevision([cellA, cellB])).not.toBe(computeNotebookRevision([cellB, cellA]));
  });

  it('changes when a cell id changes', () => {
    const renamed = { ...cellA, id: 'c1-renamed' };
    expect(computeNotebookRevision([cellA, cellB])).not.toBe(computeNotebookRevision([renamed, cellB]));
  });
});

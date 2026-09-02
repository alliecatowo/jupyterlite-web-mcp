/**
 * A minimal, dependency-free line diff between two versions of a cell's
 * source, used to render a compact before/after affordance when an agent
 * edit lands (SPEC: "Presence and visual feedback"). Deliberately simple
 * (LCS-based) and bounded: a full diffing library solves a much broader
 * problem than "show a human roughly what changed in one notebook cell,"
 * and pulling one in would be overkill for that.
 */

/** One rendered line of a computed diff. */
export interface IDiffLine {
  /** Whether this line is unchanged, added, or removed. */
  kind: 'context' | 'added' | 'removed';
  /** The line's text (without its trailing newline). */
  text: string;
}

/**
 * Above this many lines on either side, {@link diffLines} gives up on a
 * true LCS diff (which is O(n*m)) and instead reports every old line
 * removed and every new line added — still correct, just coarser.
 */
const MAX_DIFF_LINES = 400;

function splitLines(source: string): string[] {
  if (!source) {
    return [];
  }
  return source.split('\n');
}

function coarseDiff(a: string[], b: string[]): IDiffLine[] {
  const lines: IDiffLine[] = [];
  for (const text of a) {
    lines.push({ kind: 'removed', text });
  }
  for (const text of b) {
    lines.push({ kind: 'added', text });
  }
  return lines;
}

/**
 * Computes a line-level diff between `before` and `after` using a
 * straightforward longest-common-subsequence algorithm, so unchanged lines
 * in the middle of an edit are kept as `'context'` rather than shown as a
 * wholesale remove+add. `null`/`undefined` are treated as empty strings.
 *
 * Bounded: once either side exceeds {@link MAX_DIFF_LINES} lines, returns a
 * coarse "every old line removed, every new line added" result instead of
 * doing unbounded O(n*m) work — still a valid (if less readable) diff.
 */
export function diffLines(before: string | null | undefined, after: string | null | undefined): IDiffLine[] {
  const a = splitLines(before ?? '');
  const b = splitLines(after ?? '');

  if (a.length === b.length && a.every((line, i) => line === b[i])) {
    return a.map(text => ({ kind: 'context', text }));
  }

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return coarseDiff(a, b);
  }

  const n = a.length;
  const m = b.length;
  const lcs: number[][] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    lcs[i] = new Array(m + 1).fill(0);
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: IDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: 'context', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ kind: 'removed', text: a[i] });
      i++;
    } else {
      result.push({ kind: 'added', text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ kind: 'removed', text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ kind: 'added', text: b[j] });
    j++;
  }
  return result;
}

/** Whether a computed diff actually contains any added or removed lines. */
export function hasDiffChanges(lines: readonly IDiffLine[]): boolean {
  return lines.some(line => line.kind !== 'context');
}

/** Counts the added and removed lines in a computed diff. */
export function diffStats(lines: readonly IDiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'added') {
      added++;
    } else if (line.kind === 'removed') {
      removed++;
    }
  }
  return { added, removed };
}

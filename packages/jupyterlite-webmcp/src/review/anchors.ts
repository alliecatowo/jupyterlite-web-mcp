/**
 * Pure helpers for anchoring a review comment thread to a range of a cell's
 * source text, and for re-anchoring it after the cell's source has changed.
 */
import type { IAnchor, IPosition, ISourceRange } from './model';
import { stableHash } from '../jupyter/revisions';
import { LIMITS } from '../limits';

/**
 * How well a previously-recorded anchor was able to be matched against a
 * cell's current source:
 * - `'exact'`: the original range still contains the original text.
 * - `'reanchored'`: the original text moved, but was found unambiguously.
 * - `'orphaned'`: the original text could not be found, or matched
 *   ambiguously.
 * - `'cell-missing'`: the anchored cell no longer exists (determined by the
 *   caller, not by this module).
 */
export type AnchorState = 'exact' | 'reanchored' | 'orphaned' | 'cell-missing';

/**
 * The result of resolving an anchor against a cell's current source: the
 * resulting state, and (when found) the current range and text.
 */
export interface IResolvedAnchor {
  state: AnchorState;
  range?: ISourceRange;
  text?: string;
}

function splitLines(source: string): string[] {
  return source.split('\n');
}

/**
 * Converts a zero-based line/column position within `source` to a
 * character offset. Out-of-range lines or columns are clamped into the
 * valid document rather than throwing.
 */
export function offsetAt(source: string, pos: IPosition): number {
  const lines = splitLines(source);
  const lineIndex = Math.max(0, Math.min(pos.line, lines.length - 1));
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1;
  }
  const lineLength = lines[lineIndex] ? lines[lineIndex].length : 0;
  const column = Math.max(0, Math.min(pos.column, lineLength));
  return offset + column;
}

/**
 * Converts a character offset within `source` to a zero-based line/column
 * position. Exact inverse of {@link offsetAt} for offsets within range.
 */
export function positionAt(source: string, offset: number): IPosition {
  const clamped = Math.max(0, Math.min(offset, source.length));
  const lines = splitLines(source);
  let remaining = clamped;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    if (remaining <= lineLength) {
      return { line: i, column: remaining };
    }
    remaining -= lineLength + 1;
  }
  const lastIndex = Math.max(0, lines.length - 1);
  return { line: lastIndex, column: lines[lastIndex] ? lines[lastIndex].length : 0 };
}

/**
 * Returns the substring of `source` covered by `range`.
 */
export function textInRange(source: string, range: ISourceRange): string {
  const start = offsetAt(source, range.start);
  const end = offsetAt(source, range.end);
  return source.slice(Math.min(start, end), Math.max(start, end));
}

function clamp(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/**
 * Builds a `'source-range'` anchor for a selection within a cell's source:
 * captures the selected text (clamped to
 * {@link LIMITS.MAX_SELECTED_TEXT_BYTES} characters) and its hash, plus a
 * small amount of surrounding context (up to
 * {@link LIMITS.MAX_ANCHOR_CONTEXT} characters before and after) used to
 * disambiguate re-anchoring later.
 */
export function makeSourceAnchor(cellId: string, source: string, range: ISourceRange): IAnchor {
  const startOffset = offsetAt(source, range.start);
  const endOffset = offsetAt(source, range.end);
  const lo = Math.min(startOffset, endOffset);
  const hi = Math.max(startOffset, endOffset);
  const selectedText = clamp(source.slice(lo, hi), LIMITS.MAX_SELECTED_TEXT_BYTES);
  const prefix = source.slice(Math.max(0, lo - LIMITS.MAX_ANCHOR_CONTEXT), lo);
  const suffix = source.slice(hi, hi + LIMITS.MAX_ANCHOR_CONTEXT);
  return {
    kind: 'source-range',
    cellId,
    sourceRange: range,
    selectedText,
    selectedTextHash: stableHash(selectedText),
    prefix,
    suffix
  };
}

function findAllOccurrences(source: string, needle: string): number[] {
  const positions: number[] = [];
  if (!needle) {
    return positions;
  }
  let from = 0;
  for (;;) {
    const idx = source.indexOf(needle, from);
    if (idx === -1) {
      break;
    }
    positions.push(idx);
    from = idx + needle.length;
  }
  return positions;
}

function rangeForOccurrence(source: string, offset: number, length: number): ISourceRange {
  return {
    start: positionAt(source, offset),
    end: positionAt(source, offset + length)
  };
}

function scoreOccurrence(source: string, offset: number, length: number, prefix: string, suffix: string): number {
  let score = 0;
  const before = source.slice(0, offset);
  const after = source.slice(offset + length);

  if (prefix) {
    if (before.endsWith(prefix)) {
      score += 2;
    } else {
      const shortPrefix = prefix.slice(Math.max(0, prefix.length - 10));
      if (shortPrefix && before.endsWith(shortPrefix)) {
        score += 1;
      }
    }
  }
  if (suffix) {
    if (after.startsWith(suffix)) {
      score += 2;
    } else {
      const shortSuffix = suffix.slice(0, 10);
      if (shortSuffix && after.startsWith(shortSuffix)) {
        score += 1;
      }
    }
  }
  return score;
}

/**
 * Re-anchors a `'source-range'` anchor against a cell's current `source`.
 * Never throws, even on malformed input. Resolution order:
 * 1. Missing/empty `selectedText` → `'orphaned'`.
 * 2. The original `sourceRange` still contains exactly `selectedText` →
 *    `'exact'`.
 * 3. Otherwise, all occurrences of `selectedText` in `source` are found: no
 *    occurrences → `'orphaned'`; exactly one → `'reanchored'`; more than
 *    one → each is scored against the anchor's `prefix`/`suffix` context,
 *    and only a single strictly-highest-scoring occurrence resolves to
 *    `'reanchored'` — any tie is `'orphaned'` rather than guessed.
 */
export function resolveSourceAnchor(anchor: IAnchor, source: string): IResolvedAnchor {
  const selectedText = anchor.selectedText;
  if (!selectedText) {
    return { state: 'orphaned' };
  }

  if (anchor.sourceRange) {
    try {
      const existing = textInRange(source, anchor.sourceRange);
      if (existing === selectedText) {
        return { state: 'exact', range: anchor.sourceRange, text: existing };
      }
    } catch {
      // fall through to re-anchoring by search
    }
  }

  const occurrences = findAllOccurrences(source, selectedText);
  if (occurrences.length === 0) {
    return { state: 'orphaned' };
  }
  if (occurrences.length === 1) {
    const offset = occurrences[0];
    return {
      state: 'reanchored',
      range: rangeForOccurrence(source, offset, selectedText.length),
      text: selectedText
    };
  }

  const prefix = anchor.prefix ?? '';
  const suffix = anchor.suffix ?? '';
  let bestIndex = -1;
  let bestScore = -1;
  let bestCount = 0;
  for (const offset of occurrences) {
    const score = scoreOccurrence(source, offset, selectedText.length, prefix, suffix);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = offset;
      bestCount = 1;
    } else if (score === bestScore) {
      bestCount++;
    }
  }

  if (bestCount === 1 && bestIndex >= 0) {
    return {
      state: 'reanchored',
      range: rangeForOccurrence(source, bestIndex, selectedText.length),
      text: selectedText
    };
  }

  return { state: 'orphaned' };
}

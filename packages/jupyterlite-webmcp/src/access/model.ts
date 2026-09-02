/**
 * Pure data model for two related, cell-scoped features that both live
 * under the same notebook cell metadata key:
 *
 * - per-cell agent access control (`access`): what a connected agent may do
 *   with a cell, decided entirely by the human;
 * - cell provenance (`history`): a bounded, coalesced trail of who last
 *   changed a cell.
 *
 * Cell metadata is untrusted input (hand edited, from an older schema
 * version, or outright malformed), so every normalizer here is deliberately
 * defensive and never throws, following the same pattern as
 * `src/review/model.ts`'s `normalizeReview`.
 */
import { LIMITS } from '../limits';

/** The cell metadata key both features are stored under. */
export const CELL_METADATA_KEY = 'jupyterlite_webmcp';

/** What a connected agent may do with a cell. Absent means `'write'`. */
export type CellAccess = 'write' | 'read' | 'none';

/** The access level a cell has when its metadata carries no explicit value. */
export const DEFAULT_CELL_ACCESS: CellAccess = 'write';

/** Who made a recorded provenance change. */
export type HistoryActor = 'human' | 'agent';

/** What kind of change a provenance entry records. */
export type HistoryAction = 'inserted' | 'edited' | 'ran' | 'deleted';

/** One entry in a cell's bounded provenance history. */
export interface IHistoryEntry {
  /** ISO timestamp of the change (or, after coalescing, its last repeat). */
  at: string;
  /** Who made the change. */
  actor: HistoryActor;
  /** What kind of change it was. */
  action: HistoryAction;
  /** The WebMCP tool that made it, when the actor is `'agent'`. */
  tool?: string;
}

/** The `jupyterlite_webmcp` cell metadata object. */
export interface ICellAccessMetadata {
  /** What a connected agent may do with this cell. Absent means `'write'`. */
  access?: CellAccess;
  /** Bounded, newest-last provenance trail. Absent means no recorded history. */
  history?: IHistoryEntry[];
}

function isCellAccess(value: unknown): value is CellAccess {
  return value === 'write' || value === 'read' || value === 'none';
}

function isHistoryActor(value: unknown): value is HistoryActor {
  return value === 'human' || value === 'agent';
}

function isHistoryAction(value: unknown): value is HistoryAction {
  return (
    value === 'inserted' ||
    value === 'edited' ||
    value === 'ran' ||
    value === 'deleted'
  );
}

function normalizeHistoryEntry(raw: unknown): IHistoryEntry | undefined {
  const e = raw as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') {
    return undefined;
  }
  const at = typeof e.at === 'string' ? e.at : undefined;
  if (!at || !isHistoryActor(e.actor) || !isHistoryAction(e.action)) {
    return undefined;
  }
  const entry: IHistoryEntry = { at, actor: e.actor, action: e.action };
  if (typeof e.tool === 'string' && e.tool) {
    entry.tool = e.tool;
  }
  return entry;
}

/**
 * Defensively normalizes arbitrary, possibly-malformed input (as loaded from
 * untrusted cell metadata) into a well-formed {@link ICellAccessMetadata}.
 * An invalid `access` is dropped (falling back to the default `'write'` via
 * {@link effectiveAccess}); history entries that are not plausibly-shaped are
 * dropped individually rather than discarding the whole array; the result is
 * bounded to `LIMITS.MAX_CELL_HISTORY_ENTRIES`. Never throws.
 */
export function normalizeCellMetadata(raw: unknown): ICellAccessMetadata {
  try {
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    const data = raw as Record<string, unknown>;
    const result: ICellAccessMetadata = {};
    if (isCellAccess(data.access)) {
      result.access = data.access;
    }
    if (Array.isArray(data.history)) {
      const history: IHistoryEntry[] = [];
      for (const rawEntry of data.history) {
        const entry = normalizeHistoryEntry(rawEntry);
        if (entry) {
          history.push(entry);
        }
      }
      if (history.length > 0) {
        result.history = history.slice(-LIMITS.MAX_CELL_HISTORY_ENTRIES);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** The effective access level: `metadata.access`, defaulting to `'write'`. */
export function effectiveAccess(metadata: ICellAccessMetadata): CellAccess {
  return metadata.access ?? DEFAULT_CELL_ACCESS;
}

/** Cycles `write -> read -> none -> write`, for the toggle control. */
export function nextAccess(current: CellAccess): CellAccess {
  if (current === 'write') {
    return 'read';
  }
  if (current === 'read') {
    return 'none';
  }
  return 'write';
}

/** A plain-language sentence naming the current access state. */
export function accessLabel(access: CellAccess): string {
  switch (access) {
    case 'read':
      return 'Agent may read this cell';
    case 'none':
      return 'Hidden from the agent';
    default:
      return 'Agent may edit this cell';
  }
}

/** A short label for the access state, for compact UI (menu labels). */
export function accessShortLabel(access: CellAccess): string {
  switch (access) {
    case 'read':
      return 'Read only';
    case 'none':
      return 'Hidden';
    default:
      return 'Editable';
  }
}

function withinCoalesceWindow(prevAt: string, nextAt: string): boolean {
  const prev = Date.parse(prevAt);
  const next = Date.parse(nextAt);
  if (isNaN(prev) || isNaN(next)) {
    return false;
  }
  return Math.abs(next - prev) <= LIMITS.HISTORY_COALESCE_WINDOW_MS;
}

/**
 * Returns `metadata` with `entry` appended to its history, coalescing with
 * the immediately preceding entry when it shares the same `actor` and
 * `action` and falls within `LIMITS.HISTORY_COALESCE_WINDOW_MS` of it (the
 * merged entry keeps `entry`'s `at`/`tool`, so a burst of typing collapses
 * into one record with the latest timestamp instead of hundreds of them).
 * The result is always bounded to the most recent
 * `LIMITS.MAX_CELL_HISTORY_ENTRIES` entries. Immutable: does not modify
 * `metadata`.
 */
export function appendHistory(
  metadata: ICellAccessMetadata,
  entry: IHistoryEntry
): ICellAccessMetadata {
  const history = (metadata.history ?? []).slice();
  const last = history[history.length - 1];
  if (
    last &&
    last.actor === entry.actor &&
    last.action === entry.action &&
    withinCoalesceWindow(last.at, entry.at)
  ) {
    history[history.length - 1] = { ...entry };
  } else {
    history.push({ ...entry });
  }
  return {
    ...metadata,
    history: history.slice(-LIMITS.MAX_CELL_HISTORY_ENTRIES)
  };
}

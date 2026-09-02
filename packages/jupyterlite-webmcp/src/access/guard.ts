/**
 * The Jupyter-facing half of per-cell agent access control and provenance:
 * reads/writes the `jupyterlite_webmcp` cell metadata key, and the single
 * centralized access-control checkpoint (`assertCellAccessible`) every
 * id-addressed cell operation must go through.
 *
 * Deliberately has no dependency on `src/jupyter/cells.ts`,
 * `src/jupyter/execution.ts` or `src/jupyter/focus.ts` (they depend on this
 * module, not the other way around) so that every one of those call sites —
 * and `src/review/storage.ts` — can share one policy without a circular
 * import.
 */
import { NotebookPanel } from '@jupyterlab/notebook';

import { toolError } from '../jupyter/errors';
import {
  appendHistory,
  CELL_METADATA_KEY,
  CellAccess,
  effectiveAccess,
  HistoryAction,
  HistoryActor,
  ICellAccessMetadata,
  IHistoryEntry,
  normalizeCellMetadata
} from './model';

/** The narrow shape of a live cell's shared model this module relies on. */
interface ISharedCellMetadataHost {
  getMetadata?: (key: string) => unknown;
  setMetadata?: (key: string, value: unknown) => void;
  deleteMetadata?: (key: string) => void;
  transact?: (f: () => void, undoable?: boolean) => void;
}

/** Anything with a stable `id` and a shared model exposing cell metadata. */
export interface IMetadataCell {
  id: string;
  sharedModel: ISharedCellMetadataHost;
}

/** Reads a cell's `jupyterlite_webmcp` metadata, defensively normalized. */
export function readCellMetadata(cell: IMetadataCell): ICellAccessMetadata {
  try {
    const shared = cell.sharedModel;
    if (!shared || typeof shared.getMetadata !== 'function') {
      return {};
    }
    return normalizeCellMetadata(shared.getMetadata(CELL_METADATA_KEY));
  } catch {
    return {};
  }
}

/** The effective access level of a live cell (`'write'` when unset). */
export function cellAccess(cell: IMetadataCell): CellAccess {
  return effectiveAccess(readCellMetadata(cell));
}

/**
 * Persists `metadata` on a live cell, clearing the metadata key entirely
 * once it carries neither an explicit `access` nor any `history` (so a cell
 * nobody ever restricted or touched stays free of the key, exactly like a
 * notebook that predates this feature). Written outside the undo stack
 * (`transact(..., false)`), so toggling access or recording provenance never
 * shows up as an extra step in the user's undo history and never fights it.
 */
function writeCellMetadata(
  cell: IMetadataCell,
  metadata: ICellAccessMetadata
): void {
  const shared = cell.sharedModel;
  if (!shared || typeof shared.setMetadata !== 'function') {
    return;
  }
  const clean = JSON.parse(JSON.stringify(metadata)) as ICellAccessMetadata;
  const hasAccess = typeof clean.access === 'string';
  const hasHistory = Array.isArray(clean.history) && clean.history.length > 0;
  const apply = (): void => {
    if (!hasAccess && !hasHistory) {
      if (typeof shared.deleteMetadata === 'function') {
        shared.deleteMetadata(CELL_METADATA_KEY);
      }
      return;
    }
    shared.setMetadata!(CELL_METADATA_KEY, clean);
  };
  if (typeof shared.transact === 'function') {
    shared.transact(apply, false);
  } else {
    apply();
  }
}

/**
 * Sets a cell's access level explicitly. This is the only way a cell's
 * access ever changes: there is no WebMCP tool that calls it, by design —
 * only the human's toolbar/context-menu control (`src/access/commands.ts`)
 * does. Setting `'write'` (the default) removes the explicit `access` field
 * rather than writing it out, so a cell the human never restricted stays
 * indistinguishable from one in a notebook that predates this feature.
 */
export function setCellAccess(cell: IMetadataCell, access: CellAccess): void {
  const metadata = readCellMetadata(cell);
  if (access === 'write') {
    const { history } = metadata;
    writeCellMetadata(cell, history ? { history } : {});
    return;
  }
  writeCellMetadata(cell, { ...metadata, access });
}

/**
 * Appends one provenance entry to a cell's bounded, coalesced history (see
 * {@link appendHistory}).
 */
export function recordCellHistory(
  cell: IMetadataCell,
  actor: HistoryActor,
  action: HistoryAction,
  tool?: string
): void {
  const metadata = readCellMetadata(cell);
  const entry: IHistoryEntry = { at: new Date().toISOString(), actor, action };
  if (tool) {
    entry.tool = tool;
  }
  writeCellMetadata(cell, appendHistory(metadata, entry));
}

/**
 * What an id-based cell lookup intends to do with the cell it finds:
 * `'read'` only requires the cell to be visible at all; `'write'` also
 * requires it not to be restricted to read-only.
 */
export type AccessIntent = 'read' | 'write';

/**
 * The single access-control checkpoint. Every code path that resolves a
 * cell by id for the agent — reading it explicitly, writing it, deleting
 * it, running it, focusing it, or anchoring/replying to a review comment —
 * must run the cell's access level through this before proceeding, instead
 * of sprinkling its own `access === '...'` check.
 *
 * A `'none'` cell throws exactly the same `CELL_NOT_FOUND` a nonexistent id
 * would, never `CELL_ACCESS_DENIED`: this is what makes the restriction
 * unprobeable, since an agent that cannot yet see the cell can never learn,
 * from the shape of the error alone, that a cell it doesn't know about
 * exists but is hidden. `CELL_ACCESS_DENIED` is reserved for a `'read'` cell
 * under a `'write'` intent, where the agent already legitimately knows the
 * cell exists (it must have read it, or learned its id some other way).
 */
export function assertCellAccessible(
  cellId: string,
  notebookPath: string,
  access: CellAccess,
  intent: AccessIntent
): void {
  if (access === 'none') {
    throw toolError(
      'CELL_NOT_FOUND',
      `No cell with id "${cellId}" in "${notebookPath}".`,
      { cellId, notebookPath }
    );
  }
  if (intent === 'write' && access === 'read') {
    throw toolError(
      'CELL_ACCESS_DENIED',
      `The notebook owner restricted cell "${cellId}" to read-only for agents: it cannot be edited, deleted, or run.`,
      { cellId, access }
    );
  }
}

/**
 * Resolves a cell's index by id against a notebook panel, applying
 * {@link assertCellAccessible}. A raw structural scan (not
 * `findCellIndexById`, to avoid a circular import with `src/jupyter/cells.ts`,
 * which itself calls this function).
 */
export function resolveCellIndex(
  panel: NotebookPanel,
  cellId: string,
  intent: AccessIntent
): number {
  const model = panel.context.model;
  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);
    if (cell.id === cellId) {
      assertCellAccessible(
        cellId,
        panel.context.path,
        cellAccess(cell as unknown as IMetadataCell),
        intent
      );
      return i;
    }
  }
  throw toolError(
    'CELL_NOT_FOUND',
    `No cell with id "${cellId}" in "${panel.context.path}".`,
    { cellId, notebookPath: panel.context.path }
  );
}

let agentAttributionDepth = 0;

/**
 * True while a WebMCP tool call is synchronously inside
 * {@link withAgentAttribution}. The human-edit provenance listener
 * (`src/access/provenance.ts`) checks this to tell an agent-driven cell
 * mutation apart from a genuine human edit: every agent tool path that
 * mutates cell content wraps that mutation in `withAgentAttribution` *and*
 * separately calls {@link recordCellHistory} itself with `actor: 'agent'`,
 * so the listener's only job is to recognize "this one was already
 * accounted for" and stay quiet.
 */
export function isAgentAttributed(): boolean {
  return agentAttributionDepth > 0;
}

/**
 * Runs `fn` with {@link isAgentAttributed} true for its duration. Kept
 * synchronous and reentrant (a counter, not a flag) on purpose: the shared
 * notebook model's change signals fire synchronously from within a mutating
 * call such as `sharedModel.setSource(...)`, so wrapping just that call is
 * enough, and nested calls (unlikely, but cheap to support) don't stomp on
 * each other.
 */
export function withAgentAttribution(fn: () => void): void {
  agentAttributionDepth++;
  try {
    fn();
  } finally {
    agentAttributionDepth--;
  }
}

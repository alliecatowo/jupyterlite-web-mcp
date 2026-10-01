/**
 * Attributes a cell's source edits to the human by default, recording them
 * into the same bounded, coalesced provenance history that WebMCP tool
 * paths write via `recordCellHistory` (`src/jupyter/cells.ts`,
 * `src/jupyter/execution.ts`).
 *
 * This is the only place Feature 2 has to *guess* who made a change: every
 * agent-driven mutation already knows it is agent-driven and records itself
 * explicitly. This listener's job is narrower — notice a cell's source
 * actually changed, and record it as `'human'` unless
 * `src/access/guard.ts`'s `isAgentAttributed()` says the change is already
 * accounted for.
 *
 * Debounced (a burst of keystrokes collapses into one history update a few
 * seconds after typing stops, and `appendHistory` further coalesces that
 * with the previous entry) and scoped strictly to *source* changes — a
 * `CellChange` with no `sourceChange` (a metadata or output update) is
 * ignored, both because it isn't an edit and because it stops our own
 * `setMetadata` calls from re-triggering this listener.
 */
import { ICellModel } from '@jupyterlab/cells';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';

import { NotebookCellWatcher } from './cellwatch';
import { IMetadataCell, isAgentAttributed, recordCellHistory } from './guard';

/** How long to wait after the last keystroke before recording a human edit. */
const HUMAN_EDIT_DEBOUNCE_MS = 3000;

/** The minimal shape of a shared-cell change event this module reacts to. */
interface ISourceChangeLike {
  sourceChange?: unknown;
}

/**
 * Watches every open notebook's cells and, whenever a cell's source
 * actually changes outside an agent tool call, debounces a `'human'`
 * `'edited'` provenance entry for it. Entirely presentation/bookkeeping: a
 * failure here is swallowed rather than surfaced, and it never marks a
 * notebook dirty or writes anything at attach time — only in reaction to a
 * genuine subsequent source change.
 *
 * Per-cell listeners are keyed by cell *model* via
 * {@link NotebookCellWatcher}, so a closed-and-reopened notebook, a moved
 * cell, or two notebooks sharing cell ids each get their own listener, and
 * every listener (and pending timer) is released when its cell or panel
 * goes away. A pending human edit survives a move (it carries over to the
 * cell's new model) and is recorded ahead of an agent edit that lands while
 * it is still debouncing; it is dropped only when the cell is deleted or the
 * notebook closes.
 */
export class ProvenanceTracker implements IDisposable {
  constructor(tracker: INotebookTracker) {
    this._watcher = new NotebookCellWatcher<NotebookPanel>(tracker, (cell, panel) =>
      this._attachCell(cell, panel)
    );
  }

  /** Whether {@link dispose} has been called. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Disconnects every signal and clears every pending timer. */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._watcher.dispose();
  }

  private _attachCell(cell: ICellModel, panel: NotebookPanel): () => void {
    const cellId = cell.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = (): void => {
      if (cell.isDisposed) {
        return;
      }
      try {
        recordCellHistory(cell as unknown as IMetadataCell, 'human', 'edited');
      } catch {
        // Provenance bookkeeping must never throw into the editor.
      }
    };
    const schedule = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        record();
      }, HUMAN_EDIT_DEBOUNCE_MS);
    };
    const onChange = (_: unknown, change: ISourceChangeLike): void => {
      if (this._isDisposed || !change || !change.sourceChange) {
        return; // Metadata/output-only changes (including our own) are not edits.
      }
      if (isAgentAttributed()) {
        // The tool path that made this change records it itself, right after
        // this listener runs. A human edit still waiting out the debounce
        // happened first, so record it now: left to fire later it would land
        // after the agent's entry and make the cell read as human-edited.
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
          record();
        }
        return;
      }
      schedule();
    };
    cell.sharedModel.changed.connect(onChange);

    // A move replaces the cell's model with a new one under the same id
    // (see `./cellwatch.ts`); pick up a human edit the old model was still
    // debouncing when it went away.
    const carried = this._carried.get(panel);
    if (carried?.delete(cellId)) {
      schedule();
    }

    return () => {
      cell.sharedModel.changed.disconnect(onChange);
      if (timer === undefined) {
        return;
      }
      clearTimeout(timer);
      timer = undefined;
      if (this._isDisposed || panel.isDisposed) {
        return; // Shutting down, or the notebook closed: nothing left to record into.
      }
      if (!cell.isDisposed) {
        record();
        return;
      }
      // The model was removed from a notebook that is still open: either a
      // move, whose replacement model is attached right after this in the
      // same reconcile pass and picks the edit up, or a deletion, in which
      // case nothing claims it and it is dropped at the next microtask.
      this._carry(panel, cellId);
    };
  }

  private _carry(panel: NotebookPanel, cellId: string): void {
    let ids = this._carried.get(panel);
    if (!ids) {
      ids = new Set();
      this._carried.set(panel, ids);
    }
    ids.add(cellId);
    queueMicrotask(() => {
      ids.delete(cellId);
    });
  }

  private _isDisposed = false;
  private _carried = new WeakMap<NotebookPanel, Set<string>>();
  private _watcher: NotebookCellWatcher<NotebookPanel>;
}

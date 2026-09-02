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

import { IMetadataCell, isAgentAttributed, recordCellHistory } from './guard';

/** How long to wait after the last keystroke before recording a human edit. */
const HUMAN_EDIT_DEBOUNCE_MS = 3000;

/** The minimal shape of a shared-cell change event this module reacts to. */
interface ISourceChangeLike {
  sourceChange?: unknown;
}

/**
 * The minimal shape of `NotebookModel.cells.changed`'s args this module
 * reacts to (a structural subset of `IObservableList.IChangedArgs`, kept
 * local so this file doesn't need a direct dependency on
 * `@jupyterlab/observables`).
 */
interface ICellsChangeLike {
  type: string;
  newValues: ICellModel[];
  oldValues: ICellModel[];
}

/**
 * Watches every open notebook's cells and, whenever a cell's source
 * actually changes outside an agent tool call, debounces a `'human'`
 * `'edited'` provenance entry for it. Entirely presentation/bookkeeping: a
 * failure here is swallowed rather than surfaced, and it never marks a
 * notebook dirty or writes anything at attach time — only in reaction to a
 * genuine subsequent source change.
 */
export class ProvenanceTracker implements IDisposable {
  constructor(tracker: INotebookTracker) {
    tracker.widgetAdded.connect((_, panel) => this._attachPanel(panel), this);
    if (tracker.currentWidget) {
      this._attachPanel(tracker.currentWidget);
    }
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
    for (const timer of this._timers.values()) {
      clearTimeout(timer);
    }
    this._timers.clear();
    for (const detach of this._cellDetach.values()) {
      try {
        detach();
      } catch {
        // Best-effort cleanup only.
      }
    }
    this._cellDetach.clear();
  }

  private _attachPanel(panel: NotebookPanel): void {
    if (this._attachedPanels.has(panel)) {
      return;
    }
    this._attachedPanels.add(panel);
    panel.context.ready
      .then(() => {
        if (this._isDisposed || panel.isDisposed) {
          return;
        }
        const model = panel.context.model;
        for (let i = 0; i < model.cells.length; i++) {
          this._attachCell(model.cells.get(i));
        }
        model.cells.changed.connect(this._onCellsChanged, this);
      })
      .catch(() => undefined);
  }

  private _onCellsChanged = (_: unknown, change: ICellsChangeLike): void => {
    if (this._isDisposed) {
      return;
    }
    if (change.type === 'add') {
      for (const cell of change.newValues) {
        this._attachCell(cell);
      }
    } else if (change.type === 'remove') {
      for (const cell of change.oldValues) {
        this._detachCell(cell);
      }
    }
  };

  private _attachCell(cell: ICellModel): void {
    const key = cell.id;
    if (this._cellDetach.has(key)) {
      return;
    }
    const onChange = (_: unknown, change: ISourceChangeLike): void => {
      if (!change || !change.sourceChange) {
        return; // Metadata/output-only changes (including our own) are not edits.
      }
      if (isAgentAttributed()) {
        return; // The tool path that made this change already recorded it.
      }
      this._scheduleHumanEdit(cell, key);
    };
    cell.sharedModel.changed.connect(onChange);
    this._cellDetach.set(key, () => {
      cell.sharedModel.changed.disconnect(onChange);
    });
  }

  private _detachCell(cell: ICellModel): void {
    const key = cell.id;
    const detach = this._cellDetach.get(key);
    if (detach) {
      detach();
      this._cellDetach.delete(key);
    }
    const timer = this._timers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this._timers.delete(key);
    }
  }

  private _scheduleHumanEdit(cell: ICellModel, key: string): void {
    const existing = this._timers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this._timers.delete(key);
      if (cell.isDisposed) {
        return;
      }
      try {
        recordCellHistory(cell as unknown as IMetadataCell, 'human', 'edited');
      } catch {
        // Provenance bookkeeping must never throw into the editor.
      }
    }, HUMAN_EDIT_DEBOUNCE_MS);
    this._timers.set(key, timer);
  }

  private _isDisposed = false;
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _cellDetach = new Map<string, () => void>();
  private _attachedPanels = new WeakSet<NotebookPanel>();
}

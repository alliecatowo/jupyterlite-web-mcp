/**
 * Presentation-only watcher that derives the per-cell access overview shown
 * in the Agent panel's Access section: for the current notebook, every
 * cell's id, index, type, a short label and its effective access level,
 * refreshed (debounced, exactly like `src/access/markers.ts`'s
 * `AccessMarkers`) whenever the current notebook or its cells change.
 *
 * Read-only: this never writes metadata itself. Every write still goes
 * through `src/access/guard.ts`'s `setCellAccess`, the same single choke
 * point the per-cell toolbar/context-menu control uses.
 */
import { NotebookPanel, INotebookTracker } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';

import { cellAccess, IMetadataCell, readCellMetadata } from './guard';
import { CellAccess, IHistoryEntry } from './model';

const DEBOUNCE_MS = 150;

/** One row of the Access section's per-cell overview. */
export interface IAccessRow {
  /** The cell's stable id. */
  cellId: string;
  /** Zero-based index in the notebook. */
  index: number;
  /** `'code'`, `'markdown'` or `'raw'`. */
  cellType: string;
  /** A short, single-line label derived from the cell's source. */
  label: string;
  /** The cell's effective access level. */
  access: CellAccess;
  /** The cell's most recent provenance entry, if any. */
  lastHistory?: IHistoryEntry;
}

function firstLine(source: string): string {
  const line = source.split(/\r?\n/, 1)[0] ?? '';
  return line.trim();
}

/**
 * Watches an {@link INotebookTracker} and computes {@link IAccessRow}s for
 * whichever notebook is current. Fires {@link changed} (debounced) whenever
 * the current notebook switches or its cells' metadata or structure change,
 * so the Access section can re-render without polling.
 */
export class AccessOverview implements IDisposable {
  constructor(tracker: INotebookTracker) {
    this._tracker = tracker;
    tracker.currentChanged.connect(this._onCurrentChanged, this);
    this._attachToCurrent();
  }

  /** Emitted whenever the overview for the current notebook may have changed. */
  get changed(): ISignal<AccessOverview, void> {
    return this._changed;
  }

  /** Whether {@link dispose} has been called. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Disconnects every signal and clears any pending timer. */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    if (this._timeout !== null) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
    Signal.clearData(this);
  }

  /** The current rows, in cell order, for `panel`. */
  rows(panel: NotebookPanel): IAccessRow[] {
    const model = panel.context.model;
    const result: IAccessRow[] = [];
    for (let i = 0; i < model.cells.length; i++) {
      const cell = model.cells.get(i);
      const metadataCell = cell as unknown as IMetadataCell;
      const metadata = readCellMetadata(metadataCell);
      const history = metadata.history;
      result.push({
        cellId: cell.id,
        index: i,
        cellType: cell.type,
        label: firstLine(cell.sharedModel.getSource()) || '(empty cell)',
        access: cellAccess(metadataCell),
        lastHistory: history && history.length > 0 ? history[history.length - 1] : undefined
      });
    }
    return result;
  }

  private _onCurrentChanged = (): void => {
    this._attachToCurrent();
    this._scheduleUpdate();
  };

  private _attachToCurrent(): void {
    if (this._attachedPanel) {
      this._attachedPanel.content.modelContentChanged.disconnect(this._scheduleUpdate, this);
      this._attachedPanel = null;
    }
    const panel = this._tracker.currentWidget;
    if (panel) {
      panel.content.modelContentChanged.connect(this._scheduleUpdate, this);
      this._attachedPanel = panel;
    }
  }

  private _scheduleUpdate = (): void => {
    if (this._isDisposed) {
      return;
    }
    if (this._timeout !== null) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(() => {
      this._timeout = null;
      this._changed.emit();
    }, DEBOUNCE_MS);
  };

  private _isDisposed = false;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _attachedPanel: NotebookPanel | null = null;
  private _tracker: INotebookTracker;
  private _changed = new Signal<AccessOverview, void>(this);
}

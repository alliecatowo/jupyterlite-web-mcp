/**
 * Watches every cell model of every open notebook and hands each one to an
 * `attach` callback, calling the detach function it returned once the cell
 * is gone. Shared by `src/access/provenance.ts` and
 * `src/activity/markers.ts`, which both need a per-cell `sharedModel.changed`
 * listener that must not outlive the cell.
 *
 * Two JupyterLab 4 behaviours shape this:
 *
 * - A `cells.changed` `'remove'` event does not say which cells left: its
 *   `oldValues` are `undefined` placeholders (`@jupyterlab/notebook`'s
 *   `CellList`). A move is a delete plus an insert of a *new* model with the
 *   same cell id (`@jupyter/ydoc`'s `moveCells`). So state is keyed by the
 *   cell *model object*, never by `cell.id`, and every structural change is
 *   handled by reconciling the tracked models against the current list.
 * - Closing a notebook disposes its `CellList` without emitting `'remove'`,
 *   so every cell attached for a panel is detached on `panel.disposed`.
 *   A reopened notebook (or a second notebook with the same cell ids) gets
 *   fresh models, which therefore attach fresh.
 */
import type { ICellModel } from '@jupyterlab/cells';
import type { IDisposable } from '@lumino/disposable';
import type { ISignal } from '@lumino/signaling';

/** The subset of a `NotebookPanel` this module touches. */
export interface IWatchedPanel {
  readonly isDisposed: boolean;
  readonly disposed: ISignal<any, void>;
  readonly context: {
    readonly ready: Promise<void>;
    readonly model: {
      readonly cells: {
        readonly length: number;
        get(index: number): ICellModel;
        readonly changed: ISignal<any, any>;
      };
    };
  };
}

/** The subset of an `INotebookTracker` this module touches. */
export interface IWatchedTracker<P extends IWatchedPanel> {
  readonly widgetAdded: ISignal<any, P>;
  forEach(fn: (panel: P) => void): void;
}

/** Called for every newly seen cell model; returns the matching detach. */
export type CellAttach<P> = (cell: ICellModel, panel: P) => () => void;

interface IPanelState {
  cells: Map<ICellModel, () => void>;
  onCellsChanged: () => void;
  onDisposed: () => void;
}

export class NotebookCellWatcher<
  P extends IWatchedPanel
> implements IDisposable {
  constructor(tracker: IWatchedTracker<P>, attach: CellAttach<P>) {
    this._tracker = tracker;
    this._attach = attach;
    tracker.widgetAdded.connect(this._onWidgetAdded, this);
    tracker.forEach(panel => this._attachPanel(panel));
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Number of cell models currently attached across all panels (for tests). */
  get attachedCount(): number {
    let n = 0;
    for (const state of this._panels.values()) {
      n += state.cells.size;
    }
    return n;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._tracker.widgetAdded.disconnect(this._onWidgetAdded, this);
    for (const panel of Array.from(this._panels.keys())) {
      this._detachPanel(panel);
    }
  }

  private _onWidgetAdded(_: unknown, panel: P): void {
    this._attachPanel(panel);
  }

  private _attachPanel(panel: P): void {
    if (this._seen.has(panel)) {
      return;
    }
    this._seen.add(panel);
    panel.context.ready
      .then(() => {
        if (this._isDisposed || panel.isDisposed || this._panels.has(panel)) {
          return;
        }
        const state: IPanelState = {
          cells: new Map(),
          onCellsChanged: () => this._reconcile(panel),
          onDisposed: () => this._detachPanel(panel)
        };
        this._panels.set(panel, state);
        panel.context.model.cells.changed.connect(state.onCellsChanged);
        panel.disposed.connect(state.onDisposed);
        this._reconcile(panel);
      })
      .catch(() => undefined);
  }

  private _reconcile(panel: P): void {
    const state = this._panels.get(panel);
    if (!state || this._isDisposed || panel.isDisposed) {
      return;
    }
    const cells = panel.context.model.cells;
    const current = new Set<ICellModel>();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell) {
        current.add(cell);
      }
    }
    for (const [cell, detach] of Array.from(state.cells.entries())) {
      if (!current.has(cell)) {
        state.cells.delete(cell);
        safely(detach);
      }
    }
    for (const cell of current) {
      if (!state.cells.has(cell)) {
        let detach: () => void = () => undefined;
        try {
          detach = this._attach(cell, panel);
        } catch {
          // Bookkeeping only: one bad cell must not stop the rest.
        }
        state.cells.set(cell, detach);
      }
    }
  }

  private _detachPanel(panel: P): void {
    const state = this._panels.get(panel);
    if (!state) {
      return;
    }
    this._panels.delete(panel);
    try {
      panel.context.model.cells.changed.disconnect(state.onCellsChanged);
    } catch {
      // The cell list may already be disposed.
    }
    try {
      panel.disposed.disconnect(state.onDisposed);
    } catch {
      // Best effort.
    }
    for (const detach of state.cells.values()) {
      safely(detach);
    }
    state.cells.clear();
  }

  private _isDisposed = false;
  private _tracker: IWatchedTracker<P>;
  private _attach: CellAttach<P>;
  private _panels = new Map<P, IPanelState>();
  private _seen = new WeakSet<P>();
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Best-effort cleanup only.
  }
}

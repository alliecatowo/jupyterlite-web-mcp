/**
 * Keeps pending proposals from getting stuck. The inline banner
 * (`src/propose/markers.ts`) is the only Accept/Deny UI, and it can only
 * render while the target cell exists in an open notebook at the path the
 * proposal was made against. When that stops being true, no human can ever
 * decide the proposal, so its tool call would wait forever. This watcher
 * auto-denies it instead, with a reason the agent can act on:
 *
 * - the target cell was deleted (a move keeps the cell id, so it is not
 *   treated as a deletion);
 * - the notebook's last open view was closed;
 * - the notebook was renamed or moved (accept applies by the stored path,
 *   so it could never succeed).
 */
import type { IDisposable } from '@lumino/disposable';
import type { ISignal } from '@lumino/signaling';

import { ProposeStore } from './store';

export const AUTO_DENY_REASONS = {
  cellRemoved:
    'Automatically denied: the target cell no longer exists (it was deleted before the proposal was reviewed).',
  notebookClosed:
    'Automatically denied: the notebook was closed before the proposal was reviewed.',
  notebookRenamed:
    'Automatically denied: the notebook was renamed or moved before the proposal was reviewed. Re-read it at its new path and propose again.'
} as const;

/** The subset of a `NotebookPanel` this module touches. */
export interface ILifecyclePanel {
  readonly isDisposed: boolean;
  readonly disposed: ISignal<any, void>;
  readonly context: {
    readonly path: string;
    readonly ready: Promise<void>;
    readonly pathChanged: ISignal<any, string>;
    readonly model: {
      readonly cells: {
        readonly length: number;
        get(index: number): { readonly id: string } | undefined;
        readonly changed: ISignal<any, any>;
      };
    };
  };
}

/** The subset of an `INotebookTracker` this module touches. */
export interface ILifecycleTracker<P extends ILifecyclePanel> {
  readonly widgetAdded: ISignal<any, P>;
  forEach(fn: (panel: P) => void): void;
}

interface IPanelState {
  path: string;
  onCellsChanged: () => void;
  onPathChanged: (_: unknown, newPath: string) => void;
  onDisposed: () => void;
}

export class ProposalLifecycle<
  P extends ILifecyclePanel
> implements IDisposable {
  constructor(tracker: ILifecycleTracker<P>, store: ProposeStore) {
    this._tracker = tracker;
    this._store = store;
    tracker.widgetAdded.connect(this._onWidgetAdded, this);
    tracker.forEach(panel => this._attachPanel(panel));
  }

  get isDisposed(): boolean {
    return this._isDisposed;
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
          path: panel.context.path,
          onCellsChanged: () => this._onCellsChanged(panel),
          onPathChanged: (_, newPath) => this._onPathChanged(panel, newPath),
          onDisposed: () => this._onDisposed(panel)
        };
        this._panels.set(panel, state);
        panel.context.model.cells.changed.connect(state.onCellsChanged);
        panel.context.pathChanged.connect(state.onPathChanged);
        panel.disposed.connect(state.onDisposed);
      })
      .catch(() => undefined);
  }

  private _onCellsChanged(panel: P): void {
    if (this._isDisposed || panel.isDisposed) {
      return;
    }
    const path = panel.context.path;
    const pending = this._store.pending.filter(p => p.notebookPath === path);
    if (pending.length === 0) {
      return;
    }
    const cells = panel.context.model.cells;
    const ids = new Set<string>();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell) {
        ids.add(cell.id);
      }
    }
    for (const proposal of pending) {
      if (!ids.has(proposal.cellId)) {
        this._store.autoDeny(proposal.id, AUTO_DENY_REASONS.cellRemoved);
      }
    }
  }

  private _onPathChanged(panel: P, newPath: string): void {
    const state = this._panels.get(panel);
    if (!state || this._isDisposed) {
      return;
    }
    const oldPath = state.path;
    state.path = newPath;
    if (oldPath === newPath || this._isOpenElsewhere(oldPath, panel)) {
      return;
    }
    this._denyAllAt(oldPath, AUTO_DENY_REASONS.notebookRenamed);
  }

  private _onDisposed(panel: P): void {
    const state = this._panels.get(panel);
    if (!state) {
      return;
    }
    this._detachPanel(panel);
    if (this._isDisposed || this._isOpenElsewhere(state.path, panel)) {
      return;
    }
    this._denyAllAt(state.path, AUTO_DENY_REASONS.notebookClosed);
  }

  /** Whether another live view still shows the notebook at `path`. */
  private _isOpenElsewhere(path: string, except: P): boolean {
    let found = false;
    this._tracker.forEach(other => {
      if (
        other !== except &&
        !other.isDisposed &&
        this._panels.get(other)?.path === path
      ) {
        found = true;
      }
    });
    return found;
  }

  private _denyAllAt(path: string, reason: string): void {
    for (const proposal of this._store.pending) {
      if (proposal.notebookPath === path) {
        this._store.autoDeny(proposal.id, reason);
      }
    }
  }

  private _detachPanel(panel: P): void {
    const state = this._panels.get(panel);
    if (!state) {
      return;
    }
    this._panels.delete(panel);
    for (const detach of [
      () => panel.context.model.cells.changed.disconnect(state.onCellsChanged),
      () => panel.context.pathChanged.disconnect(state.onPathChanged),
      () => panel.disposed.disconnect(state.onDisposed)
    ]) {
      try {
        detach();
      } catch {
        // The model may already be disposed.
      }
    }
  }

  private _isDisposed = false;
  private _tracker: ILifecycleTracker<P>;
  private _store: ProposeStore;
  private _panels = new Map<P, IPanelState>();
  private _seen = new WeakSet<P>();
}

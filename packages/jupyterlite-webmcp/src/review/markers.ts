/**
 * Keeps a purely cosmetic marker in sync on notebook cell widgets: cells
 * with review threads get a CSS class and a couple of data attributes, so
 * the notebook itself shows where the comments are without opening the
 * review panel.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

import { ReviewStore } from './storage';

const MARKER_CLASS = 'jp-webmcp-hasComments';
const DEBOUNCE_MS = 150;

/**
 * Watches a {@link ReviewStore} and an {@link INotebookTracker} and toggles
 * `jp-webmcp-hasComments` (plus `data-webmcp-threads` /
 * `data-webmcp-open-threads`) on the cell widgets of the current notebook.
 * Recomputation is debounced so rapid typing does not thrash the DOM.
 */
export class ReviewMarkers implements IDisposable {
  constructor(tracker: INotebookTracker, store: ReviewStore) {
    this._tracker = tracker;
    this._store = store;

    store.changed.connect(this._scheduleUpdate, this);
    tracker.currentChanged.connect(this._onCurrentChanged, this);
    this._attachToCurrent();
    this._scheduleUpdate();
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

  private _onCurrentChanged = (): void => {
    this._attachToCurrent();
    this._scheduleUpdate();
  };

  private _attachToCurrent(): void {
    if (this._attachedPanel) {
      this._attachedPanel.content.modelContentChanged.disconnect(
        this._scheduleUpdate,
        this
      );
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
      this._update();
    }, DEBOUNCE_MS);
  };

  private _update(): void {
    if (this._isDisposed) {
      return;
    }
    const panel = this._tracker.currentWidget;
    if (!panel || panel.isDisposed) {
      return;
    }

    const counts = new Map<string, { open: number; total: number }>();
    const threads = this._store.listThreads(panel, { status: 'all' });
    for (const thread of threads) {
      const cellId = thread.anchor.cellId;
      const entry = counts.get(cellId) ?? { open: 0, total: 0 };
      entry.total += 1;
      if (thread.status === 'open') {
        entry.open += 1;
      }
      counts.set(cellId, entry);
    }

    const widgets = panel.content.widgets;
    for (let i = 0; i < widgets.length; i++) {
      const widget = widgets[i];
      if (!widget || widget.isDisposed) {
        continue;
      }
      const entry = counts.get(widget.model.id);
      const node = widget.node;
      node.classList.toggle(MARKER_CLASS, !!entry && entry.total > 0);
      if (entry && entry.total > 0) {
        node.dataset.webmcpThreads = String(entry.total);
        node.dataset.webmcpOpenThreads = String(entry.open);
      } else {
        delete node.dataset.webmcpThreads;
        delete node.dataset.webmcpOpenThreads;
      }
    }
  }

  private _isDisposed = false;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _attachedPanel: NotebookPanel | null = null;
  private _tracker: INotebookTracker;
  private _store: ReviewStore;
}

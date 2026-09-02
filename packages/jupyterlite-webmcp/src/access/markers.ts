/**
 * Keeps a purely cosmetic marker in sync on notebook cell widgets: a cell
 * the human restricted from the agent (`access: "read"` or `"none"`) gets a
 * subtle, persistent CSS marker and a native tooltip naming the state in
 * plain words plus (when known) who last touched the cell — the same
 * technique as `src/review/markers.ts`'s `.jp-webmcp-hasComments`, so it
 * never shifts layout. Works with no agent connected: this only ever reads
 * cell metadata that the human's own toolbar/context-menu control writes.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

import { cellAccess, IMetadataCell, readCellMetadata } from './guard';
import { accessLabel, CellAccess, IHistoryEntry } from './model';

const READ_CLASS = 'jp-webmcp-access-read';
const NONE_CLASS = 'jp-webmcp-access-none';
const DEBOUNCE_MS = 150;

function provenanceSuffix(entry: IHistoryEntry | undefined): string {
  if (!entry) {
    return '';
  }
  const who = entry.actor === 'agent' ? 'the agent' : 'you';
  const when = new Date(entry.at).toLocaleString();
  return ` Last edited by ${who}, ${when}.`;
}

function tooltipFor(access: CellAccess, history: IHistoryEntry[]): string {
  const last = history[history.length - 1];
  return accessLabel(access) + provenanceSuffix(last);
}

/**
 * Watches an {@link INotebookTracker} and applies `jp-webmcp-access-read` /
 * `jp-webmcp-access-none` (plus a native `title` tooltip) to the cell
 * widgets of the current notebook whose `jupyterlite_webmcp` metadata
 * restricts agent access. Recomputation is debounced so rapid typing or
 * metadata churn does not thrash the DOM.
 */
export class AccessMarkers implements IDisposable {
  constructor(tracker: INotebookTracker) {
    this._tracker = tracker;
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

  /** Recomputes the markers for the current notebook right away. */
  refresh(): void {
    this._scheduleUpdate();
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
    const panel: NotebookPanel | null = this._tracker.currentWidget;
    if (!panel || panel.isDisposed) {
      return;
    }
    const widgets = panel.content.widgets;
    for (let i = 0; i < widgets.length; i++) {
      const widget = widgets[i];
      if (!widget || widget.isDisposed) {
        continue;
      }
      const cell = widget.model as unknown as IMetadataCell;
      const metadata = readCellMetadata(cell);
      const access = cellAccess(cell);
      const node = widget.node;
      node.classList.toggle(READ_CLASS, access === 'read');
      node.classList.toggle(NONE_CLASS, access === 'none');
      if (access === 'write' && !metadata.history?.length) {
        node.removeAttribute('title');
      } else {
        node.title = tooltipFor(access, metadata.history ?? []);
      }
    }
  }

  private _isDisposed = false;
  private _timeout: ReturnType<typeof setTimeout> | null = null;
  private _attachedPanel: NotebookPanel | null = null;
  private _tracker: INotebookTracker;
}

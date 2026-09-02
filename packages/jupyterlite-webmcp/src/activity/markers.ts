/**
 * Keeps purely cosmetic presence markers in sync on notebook cell (and
 * output) widgets: whatever a participant just touched gets a brief CSS
 * highlight, the same idea as a live cursor or a "someone is editing this"
 * flag in a collaborative document editor. Nothing here affects tool
 * correctness; it only decorates the DOM.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

import { ActivityKind, ActivityLog } from './model';

const MARKER_CLASS = 'jp-webmcp-activity';
const ACTOR_ATTR = 'webmcpActor';
const MARKER_LIFETIME_MS = 4000;

/**
 * Watches an {@link ActivityLog} and an {@link INotebookTracker} and applies
 * a decaying `jp-webmcp-activity` (plus `jp-webmcp-activity-<kind>` and
 * `data-webmcp-actor="agent"`) marker to whichever cells (and, for
 * output-anchored events, outputs) of the current notebook were just
 * touched, removing it again a few seconds later.
 */
export class ActivityMarkers implements IDisposable {
  constructor(tracker: INotebookTracker, log: ActivityLog) {
    this._tracker = tracker;
    this._log = log;

    log.changed.connect(this._onChanged, this);
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
    Signal.clearData(this);
  }

  private _onChanged = (): void => {
    if (this._isDisposed) {
      return;
    }
    try {
      this._applyLatest();
    } catch {
      // Presentation only: a DOM surprise here must never propagate.
    }
  };

  private _applyLatest(): void {
    const panel = this._tracker.currentWidget;
    if (!panel || panel.isDisposed) {
      return;
    }
    const events = this._log.events;
    if (events.length === 0) {
      return;
    }
    const latest = events[0];
    const cellIds = latest.cellIds;
    if (cellIds.length === 0) {
      return;
    }
    for (const cellId of cellIds) {
      this._markCell(panel, cellId, latest.kind, latest.outputIndex);
    }
  }

  private _markCell(
    panel: NotebookPanel,
    cellId: string,
    kind: ActivityKind,
    outputIndex: number | undefined
  ): void {
    const widget = this._findCellWidget(panel, cellId);
    if (!widget || widget.isDisposed) {
      return;
    }
    const node = widget.node;
    const kindClass = `jp-webmcp-activity-${kind}`;
    node.classList.add(MARKER_CLASS, kindClass);
    node.dataset[ACTOR_ATTR] = 'agent';

    this._resetTimer(`cell:${cellId}`, () => {
      if (widget.isDisposed) {
        return;
      }
      node.classList.remove(MARKER_CLASS, kindClass);
      delete node.dataset[ACTOR_ATTR];
    });

    if (outputIndex === undefined || outputIndex < 0) {
      return;
    }
    try {
      const outputNodes = node.querySelectorAll('.jp-OutputArea-child');
      const outputNode = outputNodes[outputIndex] as HTMLElement | undefined;
      if (!outputNode) {
        return;
      }
      outputNode.classList.add(MARKER_CLASS, kindClass);
      this._resetTimer(`output:${cellId}:${outputIndex}`, () => {
        outputNode.classList.remove(MARKER_CLASS, kindClass);
      });
    } catch {
      // A cell without a rendered output area simply gets no output marker.
    }
  }

  private _findCellWidget(panel: NotebookPanel, cellId: string) {
    const widgets = panel.content.widgets;
    for (let i = 0; i < widgets.length; i++) {
      const widget = widgets[i];
      if (widget && !widget.isDisposed && widget.model.id === cellId) {
        return widget;
      }
    }
    return null;
  }

  private _resetTimer(key: string, onExpire: () => void): void {
    const existing = this._timers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this._timers.delete(key);
      try {
        onExpire();
      } catch {
        // Presentation only.
      }
    }, MARKER_LIFETIME_MS);
    this._timers.set(key, timer);
  }

  private _isDisposed = false;
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _tracker: INotebookTracker;
  private _log: ActivityLog;
}

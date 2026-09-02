/**
 * Keeps purely cosmetic presence markers in sync on notebook cell (and
 * output) widgets — the interaction language from `docs/agent-collaboration-
 * roadmap.md`'s "Presence and visual feedback" section: a targeted-cell
 * halo while a tool call looks in flight, a small inline cell-state
 * indicator, a before/after diff affordance for agent source edits, and an
 * output-provenance line. Nothing here affects tool correctness; it only
 * decorates the DOM, never throws past its own boundary, and is a no-op
 * once its target cell/output/panel is disposed or gone.
 */
import { ICellModel } from '@jupyterlab/cells';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

import { isAgentAttributed } from '../access/guard';
import { LIMITS } from '../limits';
import { Popover } from '../ui/popover';
import { diffLines, diffStats, hasDiffChanges, IDiffLine } from './diff';
import { ActivityKind, ActivityLog, IActivityEvent } from './model';

const MARKER_CLASS = 'jp-webmcp-activity';
const ACTOR_ATTR = 'webmcpActor';

/** How long the decaying "recently touched" cell/output fade lasts. */
const TOUCHED_LIFETIME_MS = 4000;

/**
 * How long the targeted-cell halo — the strong, calm ring shown while a
 * tool call *looks* to still be running — lasts, before the badge settles
 * into its terminal `succeeded`/`failed` state and the halo gives way to
 * the longer, fainter "recently touched" fade above. There is no real
 * "call started" signal available to this presentation layer (only
 * completed invocations are recorded), so this window is a deliberate
 * stand-in for "just happened, still worth calling out distinctly" rather
 * than a literal in-flight timer.
 */
const HALO_LIFETIME_MS = 1100;

/** How long a settled `succeeded` cell-state badge stays before fading away. */
const SUCCESS_LIFETIME_MS = 1600;

/** A cell's presentation-only lifecycle state, shown as a small inline badge. */
type CellState = 'reading' | 'applying' | 'running' | 'succeeded' | 'failed';

const STATE_LABEL: Record<CellState, string> = {
  reading: 'Reading…',
  applying: 'Applying…',
  running: 'Running…',
  succeeded: 'Done',
  failed: 'Failed'
};

/** The in-progress-looking state for a given activity kind, or `null` if none applies. */
function activeStateFor(kind: ActivityKind): CellState | null {
  switch (kind) {
    case 'read':
      return 'reading';
    case 'write':
      return 'applying';
    case 'run':
      return 'running';
    default:
      return null;
  }
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toTimeString().slice(0, 8);
  } catch {
    return '';
  }
}

/** Options accepted by the {@link ActivityMarkers} constructor. */
export interface IActivityMarkersOptions {
  /** Called from a marker's popover to reveal the full activity timeline. */
  revealActivityPanel?: () => void;
}

/**
 * Watches an {@link ActivityLog} and an {@link INotebookTracker} and applies
 * decaying presence markers to whichever cells (and outputs) of the current
 * notebook were just touched: a brief targeted halo, a small inline
 * reading/applying/running/succeeded/failed state badge, a before/after
 * diff affordance for agent-landed source edits, and an output-provenance
 * line for agent-initiated runs.
 */
export class ActivityMarkers implements IDisposable {
  constructor(tracker: INotebookTracker, log: ActivityLog, options: IActivityMarkersOptions = {}) {
    this._tracker = tracker;
    this._log = log;
    this._revealActivityPanel = options.revealActivityPanel;

    log.changed.connect(this._onChanged, this);
    tracker.widgetAdded.connect((_, panel) => this._attachDiffWatcher(panel), this);
    if (tracker.currentWidget) {
      this._attachDiffWatcher(tracker.currentWidget);
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
    for (const popover of this._popovers.values()) {
      if (!popover.isDisposed) {
        popover.dispose();
      }
    }
    this._popovers.clear();
    for (const detach of this._cellDetach.values()) {
      try {
        detach();
      } catch {
        // Best-effort cleanup only.
      }
    }
    this._cellDetach.clear();
    Signal.clearData(this);
  }

  // ---------------------------------------------------------------------
  // Activity-driven halo + cell-state badge
  // ---------------------------------------------------------------------

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
    if (latest.cellIds.length === 0) {
      return;
    }
    for (const cellId of latest.cellIds) {
      this._markCell(panel, cellId, latest);
    }
  }

  private _markCell(panel: NotebookPanel, cellId: string, event: IActivityEvent): void {
    const widget = this._findCellWidget(panel, cellId);
    if (!widget || widget.isDisposed) {
      return;
    }
    const node = widget.node;
    const kindClass = `jp-webmcp-activity-${event.kind}`;

    // The decaying "recently touched" fade (a tinted edge on the cell,
    // already styled in `style/base.css`).
    node.classList.add(MARKER_CLASS, kindClass);
    node.dataset[ACTOR_ATTR] = 'agent';
    this._resetTimer(`cell:${cellId}`, () => {
      if (widget.isDisposed) {
        return;
      }
      node.classList.remove(MARKER_CLASS, kindClass);
      delete node.dataset[ACTOR_ATTR];
    });

    // The distinct, calm targeted halo — on top of the fade above, but
    // visually its own, brief thing (`jp-webmcp-halo`).
    node.classList.add('jp-webmcp-halo');
    this._resetTimer(`halo:${cellId}`, () => {
      node.classList.remove('jp-webmcp-halo');
    });

    this._applyCellState(widget.node, cellId, event);
    this._applyOutputMarkerAndProvenance(widget, cellId, event);
  }

  private _applyCellState(cellNode: HTMLElement, cellId: string, event: IActivityEvent): void {
    const active = activeStateFor(event.kind);
    if (!active && event.ok) {
      return; // e.g. a successful focus/navigate/comment: no badge needed.
    }
    const badge = this._ensureBadge(cellNode);
    const initial: CellState = event.ok ? active ?? 'succeeded' : active ?? 'failed';
    this._renderBadge(badge, initial, event);

    this._resetTimer(`state:${cellId}`, () => {
      const settled: CellState = event.ok ? 'succeeded' : 'failed';
      this._renderBadge(badge, settled, event);
      if (settled === 'succeeded') {
        badge.classList.add('jp-webmcp-cellstate-fading');
        this._resetTimer(
          `state-fade:${cellId}`,
          () => {
            badge.remove();
          },
          SUCCESS_LIFETIME_MS
        );
      }
    }, HALO_LIFETIME_MS);
  }

  private _ensureBadge(cellNode: HTMLElement): HTMLElement {
    const row = this._ensureRow(cellNode);
    let badge = row.querySelector<HTMLElement>('.jp-webmcp-cellState');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'jp-webmcp-cellState';
      row.appendChild(badge);
    }
    return badge;
  }

  private _renderBadge(badge: HTMLElement, state: CellState, event: IActivityEvent): void {
    badge.className = `jp-webmcp-cellState jp-webmcp-cellState-${state}`;
    badge.textContent = STATE_LABEL[state];
    badge.title = event.summary;
    if (state === 'failed') {
      badge.tabIndex = 0;
      badge.setAttribute('role', 'button');
      badge.onclick = () => this._openFailurePopover(badge, event);
      badge.onkeydown = keyEvent => {
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault();
          this._openFailurePopover(badge, event);
        }
      };
    } else {
      badge.removeAttribute('role');
      badge.removeAttribute('tabindex');
      badge.onclick = null;
      badge.onkeydown = null;
    }
  }

  private _openFailurePopover(anchor: HTMLElement, event: IActivityEvent): void {
    const key = anchor;
    const existing = this._popovers.get(key);
    if (existing && !existing.isDisposed) {
      existing.dispose();
      return;
    }
    const popover = Popover.open({
      anchor,
      ariaLabel: 'Failed tool call details',
      className: 'jp-webmcp-Failure-Popover',
      onClose: () => this._popovers.delete(key),
      render: (container, close) => {
        const heading = document.createElement('div');
        heading.className = 'jp-webmcp-Ask-heading';
        heading.textContent = event.tool;
        container.appendChild(heading);

        const body = document.createElement('p');
        body.className = 'jp-webmcp-Ask-body';
        body.textContent = event.summary;
        container.appendChild(body);

        const meta = document.createElement('div');
        meta.className = 'jp-webmcp-Ask-note';
        meta.textContent =
          formatClock(event.at) + (event.errorCode ? ' · ' + event.errorCode : '') + ' · ' + event.durationMs + 'ms';
        container.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'jp-webmcp-actions';

        if (this._revealActivityPanel) {
          const openButton = document.createElement('button');
          openButton.className = 'jp-webmcp-btn';
          openButton.textContent = 'Open Activity panel';
          openButton.onclick = () => {
            try {
              this._revealActivityPanel!();
            } catch {
              // Best effort only.
            }
          };
          actions.appendChild(openButton);
        }

        const dismissButton = document.createElement('button');
        dismissButton.className = 'jp-webmcp-btn jp-webmcp-Ask-close';
        dismissButton.textContent = 'Dismiss';
        dismissButton.onclick = () => {
          anchor.remove();
          close();
        };
        actions.appendChild(dismissButton);

        container.appendChild(actions);
      }
    });
    this._popovers.set(key, popover);
  }

  private _applyOutputMarkerAndProvenance(widget: { node: HTMLElement }, cellId: string, event: IActivityEvent): void {
    const outputIndex = event.outputIndex;
    let outputNodes: NodeListOf<Element> | null = null;
    try {
      outputNodes = widget.node.querySelectorAll('.jp-OutputArea-child');
    } catch {
      outputNodes = null;
    }
    if (!outputNodes) {
      return;
    }

    if (outputIndex !== undefined && outputIndex >= 0) {
      const outputNode = outputNodes[outputIndex] as HTMLElement | undefined;
      if (outputNode) {
        const kindClass = `jp-webmcp-activity-${event.kind}`;
        outputNode.classList.add(MARKER_CLASS, kindClass);
        this._resetTimer(`output:${cellId}:${outputIndex}`, () => {
          outputNode.classList.remove(MARKER_CLASS, kindClass);
        });
      }
    }

    if (event.kind === 'run' && event.ok && outputNodes.length > 0) {
      const last = outputNodes[outputNodes.length - 1] as HTMLElement;
      this._renderProvenance(last, event);
    }
  }

  private _renderProvenance(afterNode: HTMLElement, event: IActivityEvent): void {
    const parent = afterNode.parentElement;
    if (!parent) {
      return;
    }
    let line = parent.querySelector<HTMLElement>(':scope > .jp-webmcp-outputProvenance');
    if (!line) {
      line = document.createElement('div');
      line.className = 'jp-webmcp-outputProvenance';
      line.tabIndex = 0;
      line.setAttribute('role', 'button');
      parent.appendChild(line);
    }
    line.textContent = `Run by Browser agent · ${formatClock(event.at)}`;
    const open = (): void => this._openFailurePopover(line!, event);
    line.onclick = open;
    line.onkeydown = keyEvent => {
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        keyEvent.preventDefault();
        open();
      }
    };
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

  private _resetTimer(key: string, onExpire: () => void, delay: number = TOUCHED_LIFETIME_MS): void {
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
    }, delay);
    this._timers.set(key, timer);
  }

  // ---------------------------------------------------------------------
  // Agent-edit diff affordance
  //
  // Driven independently of the activity log, by watching each cell's own
  // source changes and checking `isAgentAttributed()` (the same signal
  // `src/access/provenance.ts` uses to tell an agent edit from a human
  // one). This gives an exact before/after pair for the diff, which the
  // activity log's bounded, JSON-shaped event payloads do not carry.
  // ---------------------------------------------------------------------

  private _attachDiffWatcher(panel: NotebookPanel): void {
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
          this._attachCellDiffWatcher(model.cells.get(i));
        }
        model.cells.changed.connect((_, change) => {
          if (change.type === 'add') {
            for (const cell of change.newValues as ICellModel[]) {
              this._attachCellDiffWatcher(cell);
            }
          } else if (change.type === 'remove') {
            for (const cell of change.oldValues as ICellModel[]) {
              this._detachCellDiffWatcher(cell);
            }
          }
        }, this);
      })
      .catch(() => undefined);
  }

  private _attachCellDiffWatcher(cell: ICellModel): void {
    const key = cell.id;
    if (this._cellDetach.has(key)) {
      return;
    }
    try {
      this._knownSource.set(key, cell.sharedModel.getSource());
    } catch {
      this._knownSource.set(key, '');
    }
    const onChange = (_: unknown, change: { sourceChange?: unknown }): void => {
      if (!change || !change.sourceChange) {
        return;
      }
      let after = '';
      try {
        after = cell.sharedModel.getSource();
      } catch {
        after = '';
      }
      const before = this._knownSource.get(key) ?? '';
      this._knownSource.set(key, after);
      if (!isAgentAttributed() || cell.isDisposed) {
        return;
      }
      this._recordDiff(key, before, after);
    };
    cell.sharedModel.changed.connect(onChange);
    this._cellDetach.set(key, () => {
      cell.sharedModel.changed.disconnect(onChange);
    });
  }

  private _detachCellDiffWatcher(cell: ICellModel): void {
    const key = cell.id;
    const detach = this._cellDetach.get(key);
    if (detach) {
      detach();
      this._cellDetach.delete(key);
    }
    this._knownSource.delete(key);
  }

  private _recordDiff(cellId: string, before: string, after: string): void {
    const bounded = (s: string): string =>
      s.length > LIMITS.MAX_CELL_SOURCE_BYTES ? s.slice(0, LIMITS.MAX_CELL_SOURCE_BYTES) : s;
    const lines = diffLines(bounded(before), bounded(after));
    if (!hasDiffChanges(lines)) {
      return;
    }

    const panel = this._tracker.currentWidget;
    if (!panel || panel.isDisposed) {
      return;
    }
    const widget = this._findCellWidget(panel, cellId);
    if (!widget || widget.isDisposed) {
      return;
    }
    this._renderDiffToggle(widget.node, cellId, lines);
  }

  private _renderDiffToggle(cellNode: HTMLElement, cellId: string, lines: IDiffLine[]): void {
    const row = this._ensureRow(cellNode);
    let toggle = row.querySelector<HTMLElement>('.jp-webmcp-diffToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.className = 'jp-webmcp-diffToggle';
      row.appendChild(toggle);
    }
    const stats = diffStats(lines);
    toggle.textContent = `±${stats.added + stats.removed} changed`;
    toggle.title = 'Show what the agent changed in this cell';
    toggle.onclick = () => this._toggleDiffPopover(toggle!, cellId, lines);
  }

  private _ensureRow(cellNode: HTMLElement): HTMLElement {
    let row = cellNode.querySelector<HTMLElement>(':scope > .jp-webmcp-cellRow');
    if (!row) {
      row = document.createElement('div');
      row.className = 'jp-webmcp-cellRow';
      const inputWrapper = cellNode.querySelector('.jp-Cell-inputWrapper');
      if (inputWrapper && inputWrapper.parentElement === cellNode) {
        inputWrapper.insertAdjacentElement('afterend', row);
      } else {
        cellNode.appendChild(row);
      }
    }
    return row;
  }

  private _toggleDiffPopover(anchor: HTMLElement, cellId: string, lines: IDiffLine[]): void {
    const existing = this._popovers.get(anchor);
    if (existing && !existing.isDisposed) {
      existing.dispose();
      return;
    }
    const popover = Popover.open({
      anchor,
      ariaLabel: 'Cell source changes',
      className: 'jp-webmcp-Diff-Popover',
      onClose: () => this._popovers.delete(anchor),
      render: container => {
        const heading = document.createElement('div');
        heading.className = 'jp-webmcp-Ask-heading';
        heading.textContent = 'What the agent changed';
        container.appendChild(heading);

        const pre = document.createElement('pre');
        pre.className = 'jp-webmcp-diffBlock';
        for (const line of lines) {
          const row = document.createElement('div');
          row.className = `jp-webmcp-diffLine jp-webmcp-diffLine-${line.kind}`;
          const prefix = line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  ';
          row.textContent = prefix + line.text;
          pre.appendChild(row);
        }
        container.appendChild(pre);
      }
    });
    this._popovers.set(anchor, popover);
  }

  private _isDisposed = false;
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _popovers = new Map<HTMLElement, Popover>();
  private _cellDetach = new Map<string, () => void>();
  private _knownSource = new Map<string, string>();
  private _attachedPanels = new WeakSet<NotebookPanel>();
  private _tracker: INotebookTracker;
  private _log: ActivityLog;
  private _revealActivityPanel?: () => void;
}

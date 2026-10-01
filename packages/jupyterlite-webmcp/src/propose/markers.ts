/**
 * The inline, in-notebook half of Propose/Deny mode: renders a persistent
 * banner directly under any cell with a pending proposal — the reviewable
 * before/after diff plus Accept/Deny controls the design calls for ("even
 * edits are propositions like an inline accept deny diff"). Reuses the same
 * line-diff engine and `.jp-webmcp-diffBlock`/`.jp-webmcp-diffLine-*`
 * rendering `src/activity/markers.ts` already uses for the after-the-fact
 * `±N changed` popover, rather than a second diff UI.
 *
 * Unlike that popover, this banner is not dismissible on its own: it stays
 * up until the human accepts or denies it (or the proposal is aborted out
 * from under it), because a pending proposal is exactly the kind of thing
 * that must not be able to vanish by an incidental click elsewhere — see
 * `docs/propose-mode.md`.
 *
 * The DOM work is presentation only: it swallows its own errors, and is a
 * no-op once its target cell/panel is disposed. Because this banner is the
 * only way to decide a proposal, this class also owns a
 * {@link ProposalLifecycle}, which auto-denies proposals whose cell or
 * notebook disappears so their tool calls never hang with no UI.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';

import { diffLines, IDiffLine } from '../activity/diff';
import { LIMITS } from '../limits';
import { truncateUtf8 as boundedUtf8 } from '../utf8';
import { ProposalLifecycle } from './lifecycle';
import { IProposal, MAX_DENY_REASON_BYTES, ProposeStore, truncateUtf8 } from './store';

function findCellWidget(panel: NotebookPanel, cellId: string) {
  const widgets = panel.content.widgets;
  for (let i = 0; i < widgets.length; i++) {
    const widget = widgets[i];
    if (widget && !widget.isDisposed && widget.model.id === cellId) {
      return widget;
    }
  }
  return null;
}

function bounded(source: string): string {
  return boundedUtf8(source, LIMITS.MAX_CELL_SOURCE_BYTES);
}

/**
 * Puts `banner` where it belongs in a cell's node: right after the activity
 * row when there is one, else right after the input, else at the end. Only
 * touches the DOM when the banner is missing or out of place, so a banner
 * that is already where it belongs (and whatever the human is typing in it)
 * is left alone.
 *
 * A moved cell is a brand-new widget: JupyterLab's `Notebook._removeCell`
 * disposes the old one, taking the banner's old parent with it. A banner
 * that is no longer inside its cell's current node is therefore re-inserted
 * here, the same element, so a half-typed deny reason survives the move.
 */
export function placeBanner(cellNode: HTMLElement, banner: HTMLElement): void {
  const row = cellNode.querySelector(':scope > .jp-webmcp-cellRow');
  const inputWrapper = cellNode.querySelector(':scope > .jp-Cell-inputWrapper');
  const anchor = row ?? inputWrapper;
  if (anchor) {
    if (anchor.nextElementSibling !== banner) {
      anchor.insertAdjacentElement('afterend', banner);
    }
  } else if (banner.parentElement !== cellNode) {
    cellNode.appendChild(banner);
  }
}

interface IBannerEntry {
  banner: HTMLElement;
  /** The proposal the banner was painted for. */
  proposalId: string;
}

export class ProposalMarkers implements IDisposable {
  constructor(tracker: INotebookTracker, store: ProposeStore) {
    this._tracker = tracker;
    this._store = store;
    this._lifecycle = new ProposalLifecycle<NotebookPanel>(tracker, store);

    store.changed.connect(this._onChanged, this);
    tracker.currentChanged.connect(this._onChanged, this);
    this._onChanged();
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._lifecycle.dispose();
    this._store.changed.disconnect(this._onChanged, this);
    this._tracker.currentChanged.disconnect(this._onChanged, this);
    this._watchCells(null);
    this._clearBanners();
  }

  private _onChanged = (): void => {
    if (this._isDisposed) {
      return;
    }
    try {
      this._render();
    } catch {
      // Presentation only: a DOM surprise here must never propagate.
    }
  };

  private _render(): void {
    const panel = this._tracker.currentWidget;
    const panelChanged = panel !== this._renderedPanel;
    if (panelChanged) {
      // Switching notebooks: drop every banner from the previous one. Its
      // proposals (if any) stay pending in the store and reappear if the
      // human switches back.
      this._clearBanners();
      this._renderedPanel = panel;
      this._watchCells(panel && !panel.isDisposed ? panel : null);
    }
    if (!panel || panel.isDisposed) {
      return;
    }

    const pending = this._store.pending.filter(p => p.notebookPath === panel.context.path);
    const pendingByCell = new Map(pending.map(p => [p.cellId, p]));

    for (const [cellId, entry] of Array.from(this._banners.entries())) {
      if (pendingByCell.get(cellId)?.id !== entry.proposalId) {
        entry.banner.remove();
        this._banners.delete(cellId);
      }
    }

    for (const proposal of pending) {
      this._renderBanner(panel, proposal);
    }
  }

  private _renderBanner(panel: NotebookPanel, proposal: IProposal): void {
    const widget = findCellWidget(panel, proposal.cellId);
    if (!widget || widget.isDisposed) {
      return;
    }

    // Painted once per proposal: repainting on every store or notebook
    // change would wipe a deny reason the human is typing and drop focus.
    let entry = this._banners.get(proposal.cellId);
    if (!entry) {
      const banner = document.createElement('div');
      banner.className = 'jp-webmcp-proposal';
      this._paintBanner(banner, proposal);
      entry = { banner, proposalId: proposal.id };
      this._banners.set(proposal.cellId, entry);
    }
    placeBanner(widget.node, entry.banner);

    // A cell widget created by a move may still be a placeholder with no
    // input yet; place the banner again once it has rendered.
    const ready = (widget as { ready?: Promise<void> }).ready;
    if (ready && !this._awaitedWidgets.has(widget)) {
      this._awaitedWidgets.add(widget);
      ready.then(this._onChanged, () => undefined);
    }
  }

  /** Re-renders when the shown notebook's cells change: a move swaps the cell's widget. */
  private _watchCells(panel: NotebookPanel | null): void {
    if (this._watchedCells) {
      try {
        this._watchedCells.changed.disconnect(this._onChanged, this);
      } catch {
        // The cell list may already be disposed.
      }
      this._watchedCells = null;
    }
    const cells = panel?.context.model?.cells;
    if (cells && !this._isDisposed) {
      cells.changed.connect(this._onChanged, this);
      this._watchedCells = cells;
    }
  }

  private _clearBanners(): void {
    for (const entry of this._banners.values()) {
      entry.banner.remove();
    }
    this._banners.clear();
  }

  private _paintBanner(banner: HTMLElement, proposal: IProposal): void {
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Proposed change, awaiting review');

    const header = document.createElement('div');
    header.className = 'jp-webmcp-proposal-header';
    header.textContent = `Proposed change — ${proposal.tool}`;
    banner.appendChild(header);

    const lines: IDiffLine[] = diffLines(bounded(proposal.before), bounded(proposal.after));
    const pre = document.createElement('pre');
    pre.className = 'jp-webmcp-diffBlock jp-webmcp-proposal-diff';
    for (const line of lines) {
      const row = document.createElement('div');
      row.className = `jp-webmcp-diffLine jp-webmcp-diffLine-${line.kind}`;
      const prefix = line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  ';
      row.textContent = prefix + line.text;
      pre.appendChild(row);
    }
    banner.appendChild(pre);

    const actions = document.createElement('div');
    actions.className = 'jp-webmcp-proposal-actions';

    const acceptButton = document.createElement('button');
    acceptButton.className = 'jp-webmcp-btn jp-webmcp-proposal-accept';
    acceptButton.textContent = 'Accept';
    acceptButton.onclick = () => {
      try {
        this._store.accept(proposal.id);
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    };
    actions.appendChild(acceptButton);

    const reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.className = 'jp-webmcp-proposal-reason';
    reasonInput.placeholder = 'Reason for the agent (optional)';
    // `maxLength` counts UTF-16 code units, each at least one UTF-8 byte, so
    // this is a loose upper bound; the byte-exact cap is applied on Deny.
    reasonInput.maxLength = MAX_DENY_REASON_BYTES;
    actions.appendChild(reasonInput);

    const denyButton = document.createElement('button');
    denyButton.className = 'jp-webmcp-btn jp-webmcp-proposal-deny';
    denyButton.textContent = 'Deny';
    denyButton.onclick = () => {
      try {
        const reason = truncateUtf8(reasonInput.value.trim(), MAX_DENY_REASON_BYTES);
        this._store.deny(proposal.id, reason.length > 0 ? reason : undefined);
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    };
    actions.appendChild(denyButton);

    banner.appendChild(actions);
  }

  private _isDisposed = false;
  private _banners = new Map<string, IBannerEntry>();
  private _awaitedWidgets = new WeakSet<object>();
  private _watchedCells: NotebookPanel['context']['model']['cells'] | null = null;
  private _renderedPanel: NotebookPanel | null | undefined = undefined;
  private _tracker: INotebookTracker;
  private _store: ProposeStore;
  private _lifecycle: ProposalLifecycle<NotebookPanel>;
}

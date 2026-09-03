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
 * Presentation only: nothing about `ProposeStore`'s state machine or the
 * tool call's Promise depends on this class existing. It swallows its own
 * DOM errors, and is a no-op once its target cell/panel is disposed.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';

import { diffLines, IDiffLine } from '../activity/diff';
import { LIMITS } from '../limits';
import { IProposal, ProposeStore } from './store';

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
  return source.length > LIMITS.MAX_CELL_SOURCE_BYTES
    ? source.slice(0, LIMITS.MAX_CELL_SOURCE_BYTES)
    : source;
}

export class ProposalMarkers implements IDisposable {
  constructor(tracker: INotebookTracker, store: ProposeStore) {
    this._tracker = tracker;
    this._store = store;

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
    this._store.changed.disconnect(this._onChanged, this);
    this._tracker.currentChanged.disconnect(this._onChanged, this);
    for (const banner of this._banners.values()) {
      banner.remove();
    }
    this._banners.clear();
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
      for (const banner of this._banners.values()) {
        banner.remove();
      }
      this._banners.clear();
      this._renderedPanel = panel;
    }
    if (!panel || panel.isDisposed) {
      return;
    }

    const pending = this._store.proposals.filter(
      p => p.status === 'pending' && p.notebookPath === panel.context.path
    );
    const pendingByCell = new Map(pending.map(p => [p.cellId, p]));

    for (const [cellId, banner] of Array.from(this._banners.entries())) {
      if (!pendingByCell.has(cellId)) {
        banner.remove();
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

    let banner = this._banners.get(proposal.cellId);
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'jp-webmcp-proposal';
      const inputWrapper = widget.node.querySelector('.jp-Cell-inputWrapper');
      const row = widget.node.querySelector(':scope > .jp-webmcp-cellRow');
      if (row && row.parentElement === widget.node) {
        row.insertAdjacentElement('afterend', banner);
      } else if (inputWrapper && inputWrapper.parentElement === widget.node) {
        inputWrapper.insertAdjacentElement('afterend', banner);
      } else {
        widget.node.appendChild(banner);
      }
      this._banners.set(proposal.cellId, banner);
    }

    this._paintBanner(banner, proposal);
  }

  private _paintBanner(banner: HTMLElement, proposal: IProposal): void {
    banner.innerHTML = '';
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
    reasonInput.maxLength = 500;
    actions.appendChild(reasonInput);

    const denyButton = document.createElement('button');
    denyButton.className = 'jp-webmcp-btn jp-webmcp-proposal-deny';
    denyButton.textContent = 'Deny';
    denyButton.onclick = () => {
      try {
        const reason = reasonInput.value.trim();
        this._store.deny(proposal.id, reason.length > 0 ? reason : undefined);
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    };
    actions.appendChild(denyButton);

    banner.appendChild(actions);
  }

  private _isDisposed = false;
  private _banners = new Map<string, HTMLElement>();
  private _renderedPanel: NotebookPanel | null | undefined = undefined;
  private _tracker: INotebookTracker;
  private _store: ProposeStore;
}

/**
 * A small status-bar item reporting what the browser agent can see and is
 * doing right now, with a click-to-open diagnostics popover.
 *
 * The persistent text deliberately does not repeat what the host agent's
 * own UI already shows (its tool list). Instead it answers a question the
 * host UI cannot: is an agent connected at all, and what is it doing in
 * *this* notebook right now.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { showPopup, Popup } from '@jupyterlab/statusbar';
import { Widget } from '@lumino/widgets';

import { ActivityLog } from '../activity/model';
import { WebMCPRegistry } from '../webmcp/register';
import {
  describeInFlight,
  describeLiveState,
  CellIndexResolver,
  LIVE_STATE_WINDOW_MS,
  summarize
} from './statusText';

export { describeInFlight, describeLiveState, summarize };
export type { CellIndexResolver };

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

/**
 * A status-bar widget rendering a quiet summary of agent presence, and
 * opening a small diagnostics popover (availability, registered tools,
 * recent invocations) when clicked.
 */
export class WebMCPStatus extends Widget {
  /**
   * @param registry Drives availability/registration-error text.
   * @param activity Optional presence/activity log, used to derive the
   * brief live-state phrase shown while a tool call looks in flight.
   * @param tracker Optional notebook tracker, used only to resolve a
   * touched cell id to its current 1-based index for nicer live-state text
   * (e.g. `'cell 6'` instead of `'a cell'`); the status line degrades
   * gracefully without it.
   */
  constructor(registry: WebMCPRegistry, activity?: ActivityLog, tracker?: INotebookTracker) {
    super();
    this._registry = registry;
    this._activity = activity ?? null;
    this._tracker = tracker ?? null;
    this.addClass('jp-webmcp-StatusItem');
    this.node.addEventListener('click', this._onClick);
    registry.changed.connect(this._render, this);
    if (this._activity) {
      this._activity.changed.connect(this._onActivityChanged, this);
    }
    this._render();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.node.removeEventListener('click', this._onClick);
    if (this._liveTimer !== null) {
      clearTimeout(this._liveTimer);
      this._liveTimer = null;
    }
    if (this._popup) {
      this._popup.dispose();
      this._popup = null;
    }
    super.dispose();
  }

  private _onActivityChanged = (): void => {
    if (this._liveTimer !== null) {
      clearTimeout(this._liveTimer);
      this._liveTimer = null;
    }
    this._render();
    // Re-render once more when the live phrase is due to expire, so the
    // status settles back to idle on its own rather than staying stale
    // until some unrelated signal happens to fire.
    this._liveTimer = setTimeout(() => {
      this._liveTimer = null;
      this._render();
    }, LIVE_STATE_WINDOW_MS + 50);
  };

  private _resolveCellIndex = (cellId: string): number | null => {
    try {
      const panel = this._tracker && this._tracker.currentWidget;
      if (!panel || panel.isDisposed) {
        return null;
      }
      const widgets = (panel as NotebookPanel).content.widgets;
      for (let i = 0; i < widgets.length; i++) {
        if (!widgets[i].isDisposed && widgets[i].model.id === cellId) {
          return i;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  private _render = (): void => {
    const state = this._registry.state;
    const latest =
      this._activity && this._activity.events.length > 0 ? this._activity.events[0] : null;
    // A genuinely in-flight call wins over the recently-finished heuristic,
    // so "running cell 6" is a fact rather than an inference.
    const live =
      describeInFlight(this._activity?.inFlight ?? [], this._resolveCellIndex) ??
      describeLiveState(latest, this._resolveCellIndex);
    const { text, title } = summarize(state, live);
    this.node.textContent = text;
    this.title.caption = title;
    // `this.title` is a Lumino `Title`, not a DOM node: it drives tab labels
    // and captions elsewhere in the shell, but nothing renders it as a
    // hovered tooltip on this status-bar item. Set the native `title`
    // attribute too so hovering the item actually shows something.
    this.node.title = title;
  };

  private _onClick = (): void => {
    try {
      if (this._popup) {
        this._popup.dispose();
        this._popup = null;
      }
      const body = this._buildPopupBody();
      this._popup = showPopup({ body, anchor: this, align: 'right' });
    } catch {
      // Diagnostics are a nicety; never let this throw.
    }
  };

  private _buildPopupBody(): Widget {
    const state = this._registry.state;
    const container = document.createElement('div');
    container.className = 'jp-webmcp-StatusPopup';

    const availability = document.createElement('div');
    availability.textContent = state.available ? 'Available: yes' : 'Available: no';
    container.appendChild(availability);

    if (state.registrationError) {
      const error = document.createElement('div');
      error.textContent = 'Error: ' + state.registrationError;
      container.appendChild(error);
    }

    const toolsHeading = document.createElement('div');
    toolsHeading.textContent = 'Tools (' + state.toolNames.length + '):';
    container.appendChild(toolsHeading);

    const toolsList = document.createElement('ul');
    for (const name of state.toolNames) {
      const item = document.createElement('li');
      item.textContent = name;
      toolsList.appendChild(item);
    }
    container.appendChild(toolsList);

    const recentHeading = document.createElement('div');
    recentHeading.textContent = 'Recent invocations:';
    container.appendChild(recentHeading);

    const recentList = document.createElement('ul');
    for (const record of state.recent) {
      const item = document.createElement('li');
      const status = record.ok ? 'ok' : record.errorCode || 'ERROR';
      item.textContent =
        formatTime(record.at) + '  ' + record.name + '  ' + status + '  ' + record.durationMs + 'ms';
      recentList.appendChild(item);
    }
    container.appendChild(recentList);

    const widget = new Widget({ node: container });
    return widget;
  }

  private _popup: Popup | null = null;
  private _liveTimer: ReturnType<typeof setTimeout> | null = null;
  private _registry: WebMCPRegistry;
  private _activity: ActivityLog | null;
  private _tracker: INotebookTracker | null;
}

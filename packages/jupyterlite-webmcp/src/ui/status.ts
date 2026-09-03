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
      // `showPopup` measures geometry before the body lays out; without
      // `hasDynamicSize` the host keeps that first, wrong height and the
      // content spills over the notebook underneath.
      this._popup = showPopup({ body, anchor: this, align: 'right', hasDynamicSize: true });
    } catch {
      // Diagnostics are a nicety; never let this throw.
    }
  };

  private _buildPopupBody(): Widget {
    const state = this._registry.state;
    const container = document.createElement('div');
    container.className = 'jp-webmcp-StatusPopup';

    // Plain language first. What a reader wants to know is "can something
    // act on my notebook, and has it?" — not a schema dump. The tool names
    // stay, because an external verifier needs them, but they go last.
    const availability = document.createElement('div');
    availability.className = 'jp-webmcp-StatusPopup-availability';
    availability.textContent = state.registrationError
      ? 'This page could not publish its notebook tools.'
      : state.available
        ? 'This page has published ' +
          state.toolNames.length +
          ' notebook tools. A compatible browser agent can use them.'
        : 'This browser does not support WebMCP, so this page has published no tools. ' +
          'Nothing can act on this notebook but you.';
    container.appendChild(availability);

    if (state.available && !state.registrationError) {
      const note = document.createElement('div');
      note.className = 'jp-webmcp-StatusPopup-note';
      note.textContent =
        'This page cannot wake, summon or notify an agent, and it does not know ' +
        'whether one is watching. You decide what any agent may touch, per cell ' +
        'and per notebook, from the Agent panel.';
      container.appendChild(note);
    }

    if (state.registrationError) {
      const error = document.createElement('div');
      error.className = 'jp-webmcp-StatusPopup-error';
      error.textContent = 'Error: ' + state.registrationError;
      container.appendChild(error);
    }

    const recentHeading = document.createElement('div');
    recentHeading.className = 'jp-webmcp-StatusPopup-heading';
    recentHeading.textContent = 'Recent invocations:';
    container.appendChild(recentHeading);

    if (state.recent.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'jp-webmcp-StatusPopup-empty';
      empty.textContent = 'None yet.';
      container.appendChild(empty);
    } else {
      const recentList = document.createElement('ul');
      recentList.className = 'jp-webmcp-StatusPopup-recent';
      for (const record of state.recent) {
        const item = document.createElement('li');

        const name = document.createElement('span');
        name.className = 'jp-webmcp-StatusPopup-name';
        name.textContent = formatTime(record.at) + ' ' + record.name;
        name.title = record.name;
        item.appendChild(name);

        const status = document.createElement('span');
        status.className = record.ok
          ? 'jp-webmcp-StatusPopup-ok'
          : 'jp-webmcp-StatusPopup-err';
        status.textContent =
          (record.ok ? 'ok' : record.errorCode || 'ERROR') + ' · ' + record.durationMs + 'ms';
        item.appendChild(status);

        recentList.appendChild(item);
      }
      container.appendChild(recentList);
    }

    if (state.toolNames.length > 0) {
      const toolsHeading = document.createElement('div');
      toolsHeading.className = 'jp-webmcp-StatusPopup-heading';
      toolsHeading.textContent = 'Tools (' + state.toolNames.length + '):';
      container.appendChild(toolsHeading);

      const toolsList = document.createElement('ul');
      toolsList.className = 'jp-webmcp-StatusPopup-tools';
      for (const name of state.toolNames) {
        const item = document.createElement('li');
        item.textContent = name;
        item.title = name;
        toolsList.appendChild(item);
      }
      container.appendChild(toolsList);
    }

    const widget = new Widget({ node: container });
    return widget;
  }

  private _popup: Popup | null = null;
  private _liveTimer: ReturnType<typeof setTimeout> | null = null;
  private _registry: WebMCPRegistry;
  private _activity: ActivityLog | null;
  private _tracker: INotebookTracker | null;
}

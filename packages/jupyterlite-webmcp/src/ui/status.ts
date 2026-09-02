/**
 * A small status-bar item reporting whether WebMCP tools are registered in
 * this browser, with a click-to-open diagnostics popover.
 */
import { showPopup, Popup } from '@jupyterlab/statusbar';
import { Widget } from '@lumino/widgets';

import { IWebMCPState } from '../webmcp/types';
import { WebMCPRegistry } from '../webmcp/register';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

function summarize(state: IWebMCPState): { text: string; title: string } {
  if (state.registrationError) {
    return {
      text: 'WebMCP error',
      title: 'WebMCP registration failed: ' + state.registrationError
    };
  }
  if (!state.available) {
    return {
      text: 'WebMCP unavailable',
      title: 'This browser does not expose document.modelContext.'
    };
  }
  return {
    text: 'WebMCP · ' + state.toolCount + ' tools',
    title: state.toolCount + ' tool(s) registered with this browser.'
  };
}

/**
 * A status-bar widget that renders {@link WebMCPRegistry.state} as plain
 * text, and opens a small diagnostics popover (availability, tool names,
 * recent invocations) when clicked.
 */
export class WebMCPStatus extends Widget {
  constructor(registry: WebMCPRegistry) {
    super();
    this._registry = registry;
    this.addClass('jp-webmcp-StatusItem');
    this.node.addEventListener('click', this._onClick);
    registry.changed.connect(this._render, this);
    this._render();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.node.removeEventListener('click', this._onClick);
    if (this._popup) {
      this._popup.dispose();
      this._popup = null;
    }
    super.dispose();
  }

  private _render = (): void => {
    const state = this._registry.state;
    const { text, title } = summarize(state);
    this.node.textContent = text;
    this.title.caption = title;
  };

  private _onClick = (): void => {
    try {
      if (this._popup) {
        this._popup.dispose();
        this._popup = null;
      }
      const body = this._buildPopupBody();
      this._popup = showPopup({ body, anchor: this, align: 'right' });
    } catch (err) {
      // Diagnostics are a nicety; never let this throw.
    }
  };

  private _buildPopupBody(): Widget {
    const state = this._registry.state;
    const container = document.createElement('div');
    container.className = 'jp-webmcp-StatusPopup';

    const availability = document.createElement('div');
    availability.textContent = state.available
      ? 'Available: yes'
      : 'Available: no';
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
  private _registry: WebMCPRegistry;
}

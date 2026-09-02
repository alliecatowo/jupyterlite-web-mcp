/**
 * The right-sidebar activity panel: shows who is present (the human and the
 * browser agent) and a timeline of what each has just done, in the same
 * spirit as the presence UI of a collaborative editor.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { LabIcon, ReactWidget, UseSignal } from '@jupyterlab/ui-components';
import * as React from 'react';

import { ActivityKind, ActivityLog, IActivityEvent, IParticipant } from './model';

const activityIcon = new LabIcon({
  name: 'jupyterlite-webmcp:activity',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">' +
    '<circle class="jp-icon3" fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="12" r="8"/>' +
    '<path class="jp-icon3" fill="none" stroke="currentColor" stroke-width="2" d="M12 8v4l3 2"/>' +
    '</svg>'
});

/** Short labels for each {@link ActivityKind}, used as timeline chips. */
const KIND_LABELS: Record<ActivityKind, string> = {
  read: 'read',
  write: 'edited',
  run: 'ran',
  focus: 'pointed',
  comment: 'commented',
  navigate: 'opened',
  kernel: 'kernel'
};

/** Options accepted by the {@link ActivityPanel} constructor. */
export interface IActivityPanelOptions {
  /** The application (kept for parity with other widgets; not used directly). */
  app: JupyterFrontEnd;
  /** Tracks the current notebook. */
  tracker: INotebookTracker;
  /** Where activity events are read from. */
  log: ActivityLog;
}

/** A short, human-friendly relative time, e.g. `'just now'`, `'12s ago'`. */
function relativeTime(at: string): string {
  const then = Date.parse(at);
  if (isNaN(then)) {
    return '';
  }
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/**
 * A `ReactWidget` shown in the right sidebar, listing the current
 * participants and a timeline of recent tool activity for the notebook that
 * is currently active.
 */
export class ActivityPanel extends ReactWidget {
  constructor(options: IActivityPanelOptions) {
    super();
    this._tracker = options.tracker;
    this._log = options.log;
    this.id = 'jupyterlite-webmcp-activity';
    this.addClass('jp-webmcp-ActivityPanel');
    this.title.caption = 'Activity';
    this.title.label = '';
    this.title.icon = activityIcon;
  }

  render(): JSX.Element {
    return <UseSignal signal={this._log.changed}>{() => this._renderBody()}</UseSignal>;
  }

  private _renderBody(): JSX.Element {
    const events = this._log.events;
    return (
      <div>
        <div className="jp-webmcp-header">
          <span>Activity</span>
        </div>
        <div className="jp-webmcp-participants">
          {this._log.participants.map(participant => this._renderParticipant(participant, events))}
        </div>
        {events.length === 0 ? (
          <div className="jp-webmcp-empty">
            Nothing yet. Tool calls from a connected agent show up here.
          </div>
        ) : (
          <div className="jp-webmcp-timeline">
            {events.map(event => this._renderEvent(event))}
          </div>
        )}
      </div>
    );
  }

  private _renderParticipant(
    participant: IParticipant,
    events: readonly IActivityEvent[]
  ): JSX.Element {
    const latest = events.find(event => event.participantId === participant.id);
    return (
      <div key={participant.id} className="jp-webmcp-participant">
        <span
          className="jp-webmcp-swatch"
          style={{ backgroundColor: participant.color }}
        />
        <div className="jp-webmcp-participant-info">
          <div className="jp-webmcp-participant-name">{participant.name}</div>
          {participant.kind === 'agent' ? (
            <div className="jp-webmcp-participant-status">
              {latest ? `${latest.summary} · ${relativeTime(latest.at)}` : 'No activity yet.'}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  private _renderEvent(event: IActivityEvent): JSX.Element {
    const navigate = (): void => {
      try {
        this._reveal(event);
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    };
    return (
      <div
        key={event.id}
        className={'jp-webmcp-activity-row' + (event.ok ? '' : ' jp-webmcp-activity-failed')}
        onClick={navigate}
      >
        <span className="jp-webmcp-activity-time">{relativeTime(event.at)}</span>
        <span className={`jp-webmcp-activity-chip jp-webmcp-activity-chip-${event.kind}`}>
          {KIND_LABELS[event.kind] ?? event.kind}
        </span>
        <span className="jp-webmcp-activity-summary">{event.summary}</span>
      </div>
    );
  }

  private _reveal(event: IActivityEvent): void {
    const panel = this._tracker.currentWidget;
    if (!panel || panel.isDisposed) {
      return;
    }
    const cellId = event.cellIds[0];
    if (!cellId) {
      return;
    }
    const notebook = (panel as NotebookPanel).content;
    const widgets = notebook.widgets;
    for (let i = 0; i < widgets.length; i++) {
      if (widgets[i].model.id === cellId) {
        notebook.activeCellIndex = i;
        void notebook.scrollToItem(i, 'center').catch(() => undefined);
        return;
      }
    }
  }

  private _tracker: INotebookTracker;
  private _log: ActivityLog;
}

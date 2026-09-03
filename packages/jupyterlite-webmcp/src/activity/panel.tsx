/**
 * The Agent panel's Activity section: shows who is present (the human and
 * the browser agent) and a timeline of what each has just done, in the same
 * spirit as the presence UI of a collaborative editor. A stateless renderer
 * (`ActivitySection`) rather than its own widget: the containing
 * `WebMcpPanel` (`src/ui/panel.tsx`) re-renders this alongside the Comments
 * and Access sections.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import * as React from 'react';

import { ActivityKind, ActivityLog, IActivityEvent, IParticipant } from './model';

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

/** Options accepted by {@link ActivitySection}. */
export interface IActivitySectionProps {
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

function renderParticipant(participant: IParticipant, events: readonly IActivityEvent[]): JSX.Element {
  const latest = events.find(event => event.participantId === participant.id);
  return (
    <div key={participant.id} className="jp-webmcp-participant">
      <span className="jp-webmcp-swatch" style={{ backgroundColor: participant.color }} />
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

function reveal(tracker: INotebookTracker, event: IActivityEvent): void {
  const panel = tracker.currentWidget;
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

function renderEvent(tracker: INotebookTracker, event: IActivityEvent): JSX.Element {
  const navigate = (): void => {
    try {
      reveal(tracker, event);
    } catch (err) {
      console.warn('[jupyterlite-webmcp]', err);
    }
  };
  return (
    <div
      key={event.id}
      className={'jp-webmcp-activity-row' + (event.ok ? '' : ' jp-webmcp-activity-failed')}
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={keyEvent => {
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault();
          navigate();
        }
      }}
    >
      <span className="jp-webmcp-activity-time">{relativeTime(event.at)}</span>
      <span className={`jp-webmcp-activity-chip jp-webmcp-activity-chip-${event.kind}`}>
        {KIND_LABELS[event.kind] ?? event.kind}
      </span>
      <span className="jp-webmcp-activity-summary">{event.summary}</span>
    </div>
  );
}

/**
 * Renders the Activity section body: participants, then either the
 * timeline or an empty-state message.
 */
export function ActivitySection(props: IActivitySectionProps): JSX.Element {
  const { tracker, log } = props;
  const events = log.events;
  return (
    <div className="jp-webmcp-Activity">
      <div className="jp-webmcp-participants">
        {log.participants.map(participant => renderParticipant(participant, events))}
      </div>
      {events.length === 0 ? (
        <div className="jp-webmcp-empty">Nothing yet. Tool calls from a connected agent show up here.</div>
      ) : (
        <div className="jp-webmcp-timeline">{events.map(event => renderEvent(tracker, event))}</div>
      )}
    </div>
  );
}

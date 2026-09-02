/**
 * Pure data model for the presence / activity layer: an in-memory,
 * bounded log of what each participant (the human, or the browser agent)
 * has just done in the notebook. This mirrors the kind of presence a
 * collaborative editor already shows for other humans; here one of the
 * participants happens to be a browser agent.
 */
import { ISignal, Signal } from '@lumino/signaling';

/** The broad category of thing an activity event represents. */
export type ActivityKind =
  | 'read'
  | 'write'
  | 'run'
  | 'focus'
  | 'comment'
  | 'navigate'
  | 'kernel';

/** A participant whose actions can appear in the activity log. */
export interface IParticipant {
  /** Stable id, e.g. `'agent'` or `'human'`. */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  /** Whether this participant is a person or a browser agent. */
  kind: 'human' | 'agent';
  /** CSS color used for this participant's presence markers. */
  color: string;
}

/** One completed action, ready to render in the activity timeline. */
export interface IActivityEvent {
  /** Unique id for this event. */
  id: string;
  /** ISO timestamp of when the event was recorded. */
  at: string;
  /** Id of the {@link IParticipant} responsible for this event. */
  participantId: string;
  /** The tool invoked, e.g. `'jupyter_get_cells'`. */
  tool: string;
  /** The broad category this event falls into. */
  kind: ActivityKind;
  /** Whether the underlying tool call succeeded. */
  ok: boolean;
  /** Structured error code, present only when `ok` is `false`. */
  errorCode?: string;
  /** Workspace-relative notebook path this event touched, or `null`. */
  notebookPath: string | null;
  /** Cell ids this invocation touched. May be empty. */
  cellIds: string[];
  /** Index of the output this event is anchored to, when applicable. */
  outputIndex?: number;
  /** One short, human-readable, present-tense line describing the event. */
  summary: string;
  /** How long the underlying tool call took, in milliseconds. */
  durationMs: number;
}

/** The bounded number of events kept in an {@link ActivityLog}. */
const MAX_ACTIVITY_EVENTS = 100;

/** The browser agent, as a presence participant. */
export const AGENT_PARTICIPANT: IParticipant = {
  id: 'agent',
  name: 'Browser agent',
  kind: 'agent',
  color: 'var(--jp-webmcp-agent-color)'
};

/** The human using the notebook, as a presence participant. */
export const HUMAN_PARTICIPANT: IParticipant = {
  id: 'human',
  name: 'You',
  kind: 'human',
  color: 'var(--jp-webmcp-human-color)'
};

/**
 * An in-memory, bounded, newest-first log of {@link IActivityEvent}s, used
 * to drive both the activity panel and the cell/output presence markers.
 *
 * This is presentation state only: nothing about tool correctness depends
 * on it, and it is never persisted.
 */
export class ActivityLog {
  constructor() {
    this._participants = [HUMAN_PARTICIPANT, AGENT_PARTICIPANT];
  }

  /** Emitted whenever a new event is recorded, or the log is cleared. */
  get changed(): ISignal<ActivityLog, void> {
    return this._changed;
  }

  /** Every recorded event, newest first, bounded to the last 100. */
  get events(): readonly IActivityEvent[] {
    return this._events;
  }

  /** The known participants: the human and the browser agent. */
  get participants(): readonly IParticipant[] {
    return this._participants;
  }

  /** Records a new event, evicting the oldest event once the bound is hit. */
  record(event: IActivityEvent): void {
    this._events = [event, ...this._events].slice(0, MAX_ACTIVITY_EVENTS);
    this._changed.emit();
  }

  /**
   * Returns the cell ids touched by any event in the last `windowMs`
   * milliseconds, mapped to the {@link ActivityKind} of the newest such
   * event for that cell. Used to drive decaying cell markers.
   */
  recentlyTouched(windowMs = 4000): Map<string, ActivityKind> {
    const result = new Map<string, ActivityKind>();
    const cutoff = Date.now() - windowMs;
    for (const event of this._events) {
      const at = Date.parse(event.at);
      if (isNaN(at) || at < cutoff) {
        continue;
      }
      for (const cellId of event.cellIds) {
        if (!result.has(cellId)) {
          result.set(cellId, event.kind);
        }
      }
    }
    return result;
  }

  /** Clears every recorded event. */
  clear(): void {
    this._events = [];
    this._changed.emit();
  }

  private _events: IActivityEvent[] = [];
  private _participants: IParticipant[];
  private _changed = new Signal<ActivityLog, void>(this);
}

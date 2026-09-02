/**
 * Pure text-derivation logic for the WebMCP status-bar item, kept free of
 * any `@jupyterlab/*`/`@lumino/*` import so it can be unit-tested directly
 * under plain Node/Jest (see `src/ui/status.ts`, which is the DOM-facing
 * widget that calls into this module).
 */
import { ActivityKind, IActivityEvent, IInFlightInvocation } from '../activity/model';
import { IWebMCPState } from '../webmcp/types';

/**
 * How long a derived live-state phrase (e.g. `'running cell 6'`) stays on
 * screen before the status settles back to the quiet idle string. Kept
 * short: this is meant to read as "here's what just happened," not as a
 * durable status.
 */
export const LIVE_STATE_WINDOW_MS = 2500;

/** Present-continuous verb stem for each {@link ActivityKind}. */
const LIVE_VERB: Record<ActivityKind, string> = {
  read: 'reading',
  write: 'updating',
  run: 'running',
  focus: 'pointing at',
  comment: 'commenting on',
  navigate: 'opening',
  kernel: 'acting on'
};

/** Resolves a cell id to its current 1-based position, or `null`. */
export type CellIndexResolver = (cellId: string) => number | null;

function liveTarget(event: IActivityEvent, resolveCellIndex: CellIndexResolver): string {
  if (event.kind === 'navigate') {
    return 'the notebook';
  }
  const cellIds = event.cellIds;
  if (cellIds.length === 0) {
    return event.kind === 'kernel' ? 'the kernel' : 'the notebook';
  }
  if (cellIds.length === 1) {
    const index = resolveCellIndex(cellIds[0]);
    return index === null ? 'a cell' : `cell ${index + 1}`;
  }
  return `${cellIds.length} cells`;
}

/**
 * Derives a short present-continuous phrase (e.g. `'reading cells'`,
 * `'running cell 6'`) describing the newest {@link IActivityEvent}, for as
 * long as it still reads as "just now." Returns `null` once there is no
 * event, or once `windowMs` has passed since it was recorded — the caller
 * then falls back to a quiet idle string instead of stale live-looking text.
 */
export function describeLiveState(
  event: IActivityEvent | null,
  resolveCellIndex: CellIndexResolver = () => null,
  windowMs: number = LIVE_STATE_WINDOW_MS,
  now: number = Date.now()
): string | null {
  if (!event) {
    return null;
  }
  const at = Date.parse(event.at);
  if (isNaN(at) || now - at > windowMs || now - at < 0) {
    return null;
  }
  const verb = LIVE_VERB[event.kind] ?? 'working on';
  return `${verb} ${liveTarget(event, resolveCellIndex)}`;
}

/**
 * Describe a tool call that is genuinely in flight.
 *
 * This is preferred over {@link describeLiveState}, which can only infer
 * "just happened" from a completed event's timestamp. When a call is actually
 * running we say so because it is true, not because it is recent.
 */
export function describeInFlight(
  inFlight: readonly IInFlightInvocation[],
  resolveCellIndex: CellIndexResolver = () => null
): string | null {
  if (!inFlight || inFlight.length === 0) {
    return null;
  }
  const newest = inFlight[inFlight.length - 1];
  const verb = LIVE_VERB[newest.kind] ?? 'working on';
  return `${verb} ${liveTarget(
    { kind: newest.kind, cellIds: newest.cellIds } as IActivityEvent,
    resolveCellIndex
  )}`;
}

/** The persistent status-bar text and hover tooltip for a given state. */
export function summarize(state: IWebMCPState, live: string | null): { text: string; title: string } {
  if (state.registrationError) {
    return {
      text: 'Agent error',
      title: 'WebMCP registration failed: ' + state.registrationError
    };
  }
  if (!state.available) {
    return {
      text: 'Agent not connected',
      title:
        'No agent is connected — this browser does not expose document.modelContext, ' +
        'so no agent can register tools here.'
    };
  }
  if (live) {
    return {
      text: 'Agent · ' + live,
      title: 'The agent is ' + live + ' — click for details.'
    };
  }
  return {
    text: 'Agent connected',
    title: 'An agent can see and act on this notebook through WebMCP — click for details.'
  };
}

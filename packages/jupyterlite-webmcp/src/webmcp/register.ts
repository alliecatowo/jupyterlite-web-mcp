import { ISignal, Signal } from '@lumino/signaling';

import { AGENT_PARTICIPANT, ActivityLog } from '../activity/model';
import { deriveActivity } from '../activity/derive';
import { normalizeError } from '../jupyter/errors';
import { errorResult, okResult } from './results';
import { IInvocationRecord, IToolDefinition, IWebMCPState } from './types';

/** How many recent invocations the diagnostics popover keeps. */
const MAX_RECENT = 10;

/**
 * Registers the extension's tools with the browser's WebMCP implementation.
 *
 * Registration happens once, at plugin activation, and is never torn down:
 * a change of notebook, cell, cursor or kernel is a change of *state*, not of
 * capability, and every tool reads the current state when it is invoked.
 */
export class WebMCPRegistry {
  /**
   * @param activity Optional presence/activity log. When provided, every
   * completed invocation is also recorded there as an {@link IActivityEvent}
   * (in addition to the diagnostics popover's own recent-invocation list,
   * which is unaffected either way).
   */
  constructor(activity?: ActivityLog) {
    this._activity = activity ?? null;
  }

  /** Emitted whenever {@link state} changes. */
  get changed(): ISignal<WebMCPRegistry, void> {
    return this._changed;
  }

  /** Current registration and diagnostics state. */
  get state(): IWebMCPState {
    return this._state;
  }

  /** Whether this browser exposes the WebMCP imperative API. */
  static isAvailable(): boolean {
    return (
      typeof document !== 'undefined' &&
      !!document.modelContext &&
      typeof document.modelContext.registerTool === 'function'
    );
  }

  /**
   * Register every tool. Safe to call once; subsequent calls are ignored so a
   * hot-reloaded plugin cannot register duplicates.
   */
  async register(tools: IToolDefinition[]): Promise<void> {
    if (this._registered) {
      return;
    }
    this._registered = true;

    if (!WebMCPRegistry.isAvailable()) {
      this._update({
        available: false,
        toolCount: 0,
        toolNames: [],
        recent: []
      });
      return;
    }

    const modelContext = document.modelContext!;
    const registered: string[] = [];
    let registrationError: string | undefined;

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      try {
        await modelContext.registerTool({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: (input, options) => this._invoke(tool, input, options)
        });
        registered.push(tool.name);
      } catch (error) {
        registrationError =
          error instanceof Error ? error.message : String(error);
        break;
      }
    }

    this._update({
      available: true,
      toolCount: registered.length,
      toolNames: registered,
      recent: [],
      registrationError
    });
  }

  private async _invoke(
    tool: IToolDefinition,
    input: unknown,
    options: { signal: AbortSignal }
  ): Promise<unknown> {
    const started = Date.now();
    const requestInput = (input as Record<string, unknown>) ?? {};
    // Announce the call before running it, so the presence layer can say
    // "running cell 6" because a call really is in flight rather than
    // inferring it from how recently something finished.
    const inFlightId = this._beginActivity(tool.name, requestInput);
    try {
      const payload = await tool.handler(requestInput, {
        signal: options?.signal
      });
      const durationMs = Date.now() - started;
      this._record({
        name: tool.name,
        ok: true,
        at: new Date().toISOString(),
        durationMs
      });
      this._recordActivity({
        tool: tool.name,
        input: requestInput,
        payload,
        ok: true,
        durationMs
      });
      return okResult(payload);
    } catch (error) {
      const structured = normalizeError(error);
      const durationMs = Date.now() - started;
      this._record({
        name: tool.name,
        ok: false,
        errorCode: structured.error,
        at: new Date().toISOString(),
        durationMs
      });
      this._recordActivity({
        tool: tool.name,
        input: requestInput,
        payload: structured,
        ok: false,
        errorCode: structured.error,
        durationMs
      });
      return errorResult(structured);
    } finally {
      this._endActivity(inFlightId);
    }
  }

  /**
   * Note that a tool call has started, returning the id used to close it out.
   *
   * Returns `null` when there is no activity log, or when deriving the target
   * cells fails: presence is decoration, and it must never be able to break an
   * actual tool call.
   */
  private _beginActivity(
    tool: string,
    input: Record<string, unknown>
  ): string | null {
    if (!this._activity) {
      return null;
    }
    try {
      const derived = deriveActivity({
        tool,
        input,
        payload: null,
        ok: true,
        durationMs: 0
      });
      return this._activity.beginInvocation({
        tool,
        kind: derived.kind,
        cellIds: derived.cellIds
      });
    } catch {
      return null;
    }
  }

  /** Note that a tool call has settled. */
  private _endActivity(id: string | null): void {
    if (!this._activity || id === null) {
      return;
    }
    try {
      this._activity.endInvocation(id);
    } catch {
      // Presence must never break a tool call.
    }
  }

  private _recordActivity(facts: Parameters<typeof deriveActivity>[0]): void {
    if (!this._activity) {
      return;
    }
    try {
      const derived = deriveActivity(facts);
      this._activity.record({
        ...derived,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        at: new Date().toISOString(),
        participantId: AGENT_PARTICIPANT.id
      });
    } catch {
      // The activity layer is presentation only and must never break a
      // tool invocation.
    }
  }

  private _record(record: IInvocationRecord): void {
    const recent = [record].concat(this._state.recent).slice(0, MAX_RECENT);
    this._update({ ...this._state, recent });
  }

  private _update(state: IWebMCPState): void {
    this._state = state;
    this._changed.emit();
  }

  private _registered = false;
  private _state: IWebMCPState = {
    available: false,
    toolCount: 0,
    toolNames: [],
    recent: []
  };
  private _changed = new Signal<WebMCPRegistry, void>(this);
  private _activity: ActivityLog | null;
}

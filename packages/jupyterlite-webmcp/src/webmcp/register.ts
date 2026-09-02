import { ISignal, Signal } from '@lumino/signaling';

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
    try {
      const payload = await tool.handler(
        (input as Record<string, unknown>) ?? {},
        { signal: options?.signal }
      );
      this._record({
        name: tool.name,
        ok: true,
        at: new Date().toISOString(),
        durationMs: Date.now() - started
      });
      return okResult(payload);
    } catch (error) {
      const structured = normalizeError(error);
      this._record({
        name: tool.name,
        ok: false,
        errorCode: structured.error,
        at: new Date().toISOString(),
        durationMs: Date.now() - started
      });
      return errorResult(structured);
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
}

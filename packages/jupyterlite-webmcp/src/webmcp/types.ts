/**
 * Shape of a tool before it is handed to `document.modelContext`.
 *
 * Keeping the definitions in plain data lets the Jupyter operations be written
 * and tested without any WebMCP involvement, and keeps the registration layer
 * thin enough to audit at a glance.
 */
export interface IToolDefinition {
  /** Stable tool name, e.g. `jupyter_get_cells`. */
  name: string;
  /** Short human-readable title. */
  title: string;
  /** Agent-oriented description of what the tool does. */
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
  /** Behaviour metadata surfaced to the agent. */
  annotations: {
    /** True when the tool changes no state at all. */
    readOnlyHint: boolean;
    /**
     * True when the result can contain notebook content, which is user data
     * and may contain text that tries to instruct the agent.
     */
    untrustedContentHint: boolean;
  };
  /** Implementation. Returns a plain JSON-serializable payload. */
  handler: (
    input: Record<string, unknown>,
    options: { signal?: AbortSignal }
  ) => Promise<unknown>;
}

/** One entry in the diagnostic log shown by the status bar item. */
export interface IInvocationRecord {
  /** Tool that was invoked. */
  name: string;
  /** Whether it succeeded. */
  ok: boolean;
  /** Structured error code when it failed. */
  errorCode?: string;
  /** ISO timestamp of completion. */
  at: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

/** Live registration state, rendered by the status bar item. */
export interface IWebMCPState {
  /** Whether `document.modelContext` exists in this browser. */
  available: boolean;
  /** Number of tools successfully registered. */
  toolCount: number;
  /** Names of the registered tools. */
  toolNames: string[];
  /** Most recent invocations, newest first, bounded. */
  recent: IInvocationRecord[];
  /** Set when registration itself failed. */
  registrationError?: string;
}

/**
 * A test-only stand-in for the browser's WebMCP implementation.
 *
 * Chromium does not ship `document.modelContext` yet, so the browser tests
 * install this before any page script runs. It captures registrations, records
 * duplicates, and lets a test invoke a tool exactly the way an agent would,
 * including an `AbortSignal`.
 *
 * This is TEST ONLY. The extension feature-detects the real API and ships no
 * polyfill: see `WebMCPRegistry.isAvailable()`.
 */
export function installWebMCPShim(): void {
  const tools = new Map<string, any>();
  const duplicates: string[] = [];
  const registrations: string[] = [];

  const modelContext = {
    async registerTool(tool: any): Promise<void> {
      registrations.push(tool.name);
      if (tools.has(tool.name)) {
        duplicates.push(tool.name);
        return;
      }
      tools.set(tool.name, tool);
    },
    async getTools(): Promise<any[]> {
      return Array.from(tools.values()).map(tool => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        origin: window.location.origin,
        window
      }));
    },
    ontoolchange: null,
    addEventListener(): void {
      /* no listeners needed in tests */
    },
    removeEventListener(): void {
      /* no listeners needed in tests */
    },
    dispatchEvent(): boolean {
      return true;
    }
  };

  Object.defineProperty(document, 'modelContext', {
    value: modelContext,
    configurable: true,
    writable: false
  });

  (window as any).__webmcp = {
    /** Names of every successfully registered tool. */
    toolNames: () => Array.from(tools.keys()),
    /** Every registerTool call, including duplicates. */
    registrations: () => registrations.slice(),
    /** Tool names that were registered more than once. */
    duplicates: () => duplicates.slice(),
    /** The definition an agent would see. */
    definition: (name: string) => {
      const tool = tools.get(name);
      return tool
        ? {
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations
          }
        : null;
    },
    /**
     * Invoke a tool the way an agent would and return the parsed payload.
     *
     * Resolves to `{ ok, payload, raw }` where `payload` is the parsed JSON of
     * the text content and `ok` is false when the tool reported an error.
     */
    call: async (
      name: string,
      args?: Record<string, unknown>,
      options?: { abortAfterMs?: number }
    ) => {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`No registered tool named "${name}"`);
      }
      const controller = new AbortController();
      if (options?.abortAfterMs !== undefined) {
        window.setTimeout(() => controller.abort(), options.abortAfterMs);
      }
      const raw = await tool.execute(args ?? {}, { signal: controller.signal });
      const text = raw?.content?.[0]?.text;
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (error) {
        payload = { parseError: String(error), text };
      }
      return { ok: !raw?.isError, payload, raw };
    }
  };
}

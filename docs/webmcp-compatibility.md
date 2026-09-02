# WebMCP compatibility

Everything here was verified against a real browser, not inferred from the
specification. Where a claim comes from the explainer rather than an
observation, it says so.

## What this extension uses

The current imperative API, and nothing else:

```js
document.modelContext.registerTool(
  { name, title, description, inputSchema, execute, annotations },
  { signal }
);
```

It does **not** use `navigator.modelContext` (kept in the specification only as
a deprecated alias), `provideContext` (removed from earlier drafts), or the
declarative `<form>` API. Tools are registered once, at plugin activation, and
never re-registered: a change of notebook, cell, cursor, kernel or comment is a
change of *state*, and every tool reads the current state when it runs.

Registration is guarded so a hot-reloaded plugin cannot register twice; a
browser test asserts the registry sees exactly 19 tools and no duplicates.

## Browser support

WebMCP has not shipped to any stable browser. The extension therefore
feature-detects and degrades:

```ts
document.modelContext && typeof document.modelContext.registerTool === 'function'
```

When that is false the extension registers nothing, the status bar reads
`WebMCP unavailable`, and JupyterLite — including the Review panel and every
comment feature — works exactly as it otherwise would. The extension never
defines `document.modelContext` itself; it ships no polyfill.

Verified on the public deployment in Chrome 150 with WebMCP off:
`document.modelContext` is `undefined`, both plugins still activate, the
`jupyterlite-webmcp:add-comment` command is present, and the status bar reads
`WebMCP unavailable`.

To turn it on in a Chromium-based browser that has the trial, enable
**Experimental Web Platform features** at `chrome://flags` and restart. Verified
on the public deployment in Chrome 150 with the flag on: `document.modelContext`
is an object, `getTools()` returns all 19 tools with their annotations intact,
and the status bar reads `WebMCP · 19 tools`.

## Calling convention, as Chrome actually implements it

Two details of Chrome's implementation are worth knowing, because they are not
obvious from the explainer and they will bite anyone driving the API by hand.

**Tool arguments are passed as a JSON string, not an object.**

```js
const tools = await document.modelContext.getTools();
const tool = tools.find(t => t.name === 'jupyter_get_context');

await document.modelContext.executeTool(tool, {});               // throws
// UnknownError: Failed to parse input arguments

await document.modelContext.executeTool(tool, JSON.stringify({})); // works
```

**`RegisteredTool.inputSchema` also comes back as a JSON string**, so it needs
parsing before it can be inspected:

```js
const schema = JSON.parse(tool.inputSchema);
schema.properties; // …
```

**The result is a string too.** `executeTool` resolves with the serialized
return value of the tool's `execute` callback, so it needs one parse to get the
envelope and a second to get the payload:

```js
const raw = await document.modelContext.executeTool(tool, JSON.stringify(args));
const envelope = JSON.parse(raw);
//   { content: [{ type: 'text', text }], structuredContent, isError? }
const payload = JSON.parse(envelope.content[0].text);
```

## About the result envelope

The specification types a tool's return value as `any` and says only that the
browser serializes it to a JSON string. It does **not** mandate a shape.

This extension returns the Model Context Protocol tool-result shape:

```json
{
  "content": [{ "type": "text", "text": "<json>" }],
  "structuredContent": { "…": "…" },
  "isError": false
}
```

That is a convention borrowed from MCP, chosen because agents bridging WebMCP to
an MCP client already understand it, not because the specification requires it.
The same payload appears twice on purpose: once as text for a client that only
reads `content`, and once as `structuredContent` for a client that can use
structured data directly. `isError` is set for a structured failure; the payload
is then the error object described in
[`webmcp-tools.md`](./webmcp-tools.md).

If the specification later blesses a different shape, `src/webmcp/results.ts` is
the only file that has to change.

## Cancellation

Every tool's `execute` receives `options.signal`. `jupyter_run_cells` is the only
tool that does anything with it, because it is the only one that can run long
enough to be worth cancelling. When the signal aborts mid-execution it makes a
best-effort kernel interrupt, and only for work that invocation itself started —
the kernel is shared with the human, so an abort must never stop something they
kicked off by hand. The remaining tools complete in single-digit milliseconds.

## What WebMCP cannot do

WebMCP has no way for a page to wake, summon or notify an agent. Nothing in this
extension implies otherwise. Editing a cell, moving a slider, running something,
or adding a review comment does not call an agent; it changes the live state the
agent will see the next time the human invokes it.

## Not implemented

`getTools()` and `executeTool()` are for in-page agents discovering tools from
other frames. This extension registers tools and does not consume them, so it
calls neither, and it sets no `exposedTo` origins: its tools are exposed to the
document itself, same-origin frames in the tree, and the browser's own agent,
which is the default.

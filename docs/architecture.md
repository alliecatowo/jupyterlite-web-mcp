# Architecture

## Dependency direction

The extension is layered so that Jupyter semantics never depend on WebMCP,
and WebMCP never contains Jupyter logic of its own:

```text
JupyterLab APIs (NotebookPanel, INotebookTracker, sharedModel, sessionContext, ...)
        |
        v
src/jupyter/*        — a thin adapter over those APIs: resolving notebooks,
        |               reading/writing cells, running cells, focus, hashing,
        |               serializing outputs, structured errors.
        v
semantic operations   — the functions in src/jupyter/* ARE the semantic
        |               operations; they return plain, JSON-serializable
        |               data (INotebookInfo, ICellSnapshot, ...), not
        |               WebMCP-shaped results.
        v
src/webmcp/*          — a thin adapter that turns each semantic operation
                          into a named tool: JSON Schema input validation,
                          annotations, and wrapping the result/error into the
                          `{content, structuredContent}` envelope.
```

`src/webmcp/tools.ts` is intentionally the only file that both imports
`src/jupyter/*` operations and builds WebMCP tool definitions; every
individual tool handler is a few lines of argument parsing followed by one
call into `src/jupyter/*` or `src/review/*`. This keeps the WebMCP layer
thin for two reasons: first, every Jupyter operation is independently
testable and independently useful (the extension would still make sense as
a plain JupyterLab command-palette feature with no WebMCP at all); second,
it keeps the one file that talks to `document.modelContext` small enough to
audit for the things that matter most — no hidden execution paths, no
unbounded results, no silently-overwritten edits — without wading through
notebook-model plumbing at the same time.

`src/review/*` is a parallel, independent stack with the same shape:
`review/model.ts` and `review/anchors.ts` are pure data/algorithm modules
with no JupyterLab imports, `review/storage.ts` is the Jupyter-facing
adapter (reads/writes notebook metadata), and the WebMCP comment tools in
`src/webmcp/tools.ts` are thin wrappers around `ReviewStore`.

## System diagram

```text
┌───────────────────────────────────────────────────────────────────┐
│                              Browser                              │
│                                                                   │
│   JupyterLab UI  <──────────────>  live notebook model            │
│        │                                   │                     │
│        │                                   v                     │
│        │                     JupyterLite contents + IndexedDB     │
│        │                                   │                     │
│        │                                   v                     │
│        │                        Pyodide / WebWorker kernel        │
│        │                                                         │
│        v                                                         │
│   jupyterlite-webmcp  (src/jupyter/* + src/review/*)              │
│        │                                                         │
│        v                                                         │
│   src/webmcp/*  ──────>  document.modelContext.registerTool(...)  │
│                                   │                                │
└───────────────────────────────────┼────────────────────────────────┘
                                    v
                     compatible browser agent
```

The live notebook model is the single source of truth. JupyterLab's own UI
and `jupyterlite-webmcp` both read and write it directly; JupyterLite's
contents manager persists it to IndexedDB, and the notebook's own kernel
messaging talks to the in-browser Pyodide kernel. `jupyterlite-webmcp` adds
no additional storage and no additional execution path: it is another
reader/writer of exactly the same model, exposed outward through
`document.modelContext`.

## File-by-file

| File | Job |
| --- | --- |
| `src/index.ts` | Defines and exports the two plugins (`jupyterlite-webmcp:review`, `jupyterlite-webmcp:tools`); wires the review store, panel, commands, and markers together, and registers WebMCP tools once `app.started` resolves. |
| `src/tokens.ts` | The `IReviewStore` Lumino token, so the review store can be `provide`d by one plugin and `require`d by another. |
| `src/limits.ts` | Centralized numeric bounds (see below) used by every module that serializes notebook data into a tool result. |
| `src/jupyter/workspace.ts` | `IJupyterEnv` (the app/docManager/tracker/fileBrowser bundle every operation takes), workspace listing, current directory, and open-document paths. |
| `src/jupyter/paths.ts` | Validates and normalizes workspace-relative paths; rejects absolute paths, `..` traversal, backslashes, and control characters. |
| `src/jupyter/notebook.ts` | Resolves a notebook panel from an optional path (reusing an already-open panel so reads are always live, never stale disk bytes); notebook/kernel summaries; create and save notebook. |
| `src/jupyter/cells.ts` | Reads bounded cell snapshots; insert/update/delete cell, each guarded by `sourceHash` where mutation risks discarding an edit. |
| `src/jupyter/execution.ts` | Runs existing cells on the shared kernel (never an arbitrary source string); interrupt/restart kernel actions. |
| `src/jupyter/focus.ts` | Reads the human's active cell/selection/cursor; reveals and focuses a cell, optionally setting an exact selection, using the notebook's native windowed-scroll and editor APIs. |
| `src/jupyter/outputs.ts` | Serializes raw nbformat outputs into bounded, agent-safe JSON: text is ANSI-stripped and byte-bounded, images/binary payloads are represented only by mime type and byte estimate, and a deterministic output fingerprint is computed for change detection. |
| `src/jupyter/revisions.ts` | `stableHash`, `hashCellSource`, and `computeNotebookRevision` — the deterministic, non-cryptographic hashing this project's concurrency guarantees are built on. |
| `src/jupyter/errors.ts` | The closed `ErrorCode` union, the `ToolError` exception type, and `normalizeError`, which reduces any thrown value to a plain `{error, message, ...}` object. |
| `src/webmcp/schemas.ts` | The JSON Schema for every tool's input, keyed by tool name. |
| `src/webmcp/tools.ts` | Builds all 19 `IToolDefinition`s: argument parsing/validation, then a call into `src/jupyter/*` or `src/review/*`, then a plain JSON payload. |
| `src/webmcp/results.ts` | `boundJson`, `okResult`, `errorResult` — bounds a JSON payload's serialized size and builds the `{content, structuredContent, isError}` envelope. |
| `src/webmcp/register.ts` | `WebMCPRegistry`: feature-detects `document.modelContext`, registers every tool exactly once, wraps each tool's `execute` to normalize errors and record diagnostics, and exposes live registration state for the status bar item. |
| `src/webmcp/types.ts` | `IToolDefinition`, `IWebMCPState`, `IInvocationRecord` — the plain-data shapes the registry and status UI share. |
| `src/review/model.ts` | Pure data model for review threads: `IThread`/`IAnchor`/`IMessage` types, `normalizeReview` (defensive deserialization of untrusted metadata), and immutable thread-construction helpers (`createThread`, `withMessage`, `withStatus`). |
| `src/review/anchors.ts` | Pure line/column <-> offset conversion and the source-range re-anchoring algorithm (`resolveSourceAnchor`, `makeSourceAnchor`). |
| `src/review/storage.ts` | `ReviewStore`: reads/writes the review metadata key on the live notebook model, lists/creates/replies/resolves/reopens threads, and computes each thread's current `anchorStatus` against the live notebook. |
| `src/review/commands.ts` | Front-end commands (`Add Comment`, `Comment on Cell`, `Comment on Output`, `Show Review Panel`) and their context-menu entries, used by a human without any agent involved. |
| `src/review/panel.tsx` | The right-sidebar React `ReviewPanel`: lists threads for the current notebook with filters (Open/Resolved/All/Current cell), reply/resolve/reopen controls, and click-to-navigate. |
| `src/review/markers.ts` | Purely cosmetic: toggles a CSS class and `data-webmcp-threads`/`data-webmcp-open-threads` attributes on cell DOM nodes that have comment threads, debounced, so the notebook shows where the comments are without opening the panel. |
| `src/ui/status.ts` | `WebMCPStatus`: an optional status-bar item showing availability and tool count, with a click-to-open diagnostics popover (registered tools, recent invocations). |

## The two plugins

```ts
jupyterlite-webmcp:review
  requires: [INotebookTracker]
  optional: [ILayoutRestorer]
  provides: IReviewStore

jupyterlite-webmcp:tools
  requires: [INotebookTracker, IDocumentManager, IReviewStore]
  optional: [IDefaultFileBrowser, IStatusBar]
```

Review is its own plugin, independent of WebMCP, because it is a normal
notebook feature in its own right: a human creates, replies to, resolves,
reopens, and navigates comments from the Review panel with no browser agent
involved at all, and that must keep working in a browser with no
`document.modelContext`. Structuring it this way also means the tools
plugin doesn't need to know anything about comment storage — it just
`require`s the `IReviewStore` token the review plugin provides and calls its
public methods, the same way the Review panel does.

## Concurrency: hashing and the read-hash-write protocol

Three hashing primitives, all in `src/jupyter/revisions.ts`, all
deterministic and explicitly non-cryptographic (two independent 32-bit
FNV-1a passes folded into a 16-hex-character digest — cheap change
detection, not security):

- **`stableHash(input)`** — the base primitive: a 16-hex-character digest of
  any string.
- **`hashCellSource(cellType, source)`** — `stableHash(cellType + ' ' +
  source)`. This is the `sourceHash` every cell-read tool returns and every
  mutating cell tool requires back.
- **`computeNotebookRevision(cells)`** — folds every cell's id, type, and
  `hashCellSource` (in cell order) into one `rev_<16 hex>` token, returned
  as `INotebookInfo.revision`. Any change to a cell's id, type, source, or
  the notebook's cell order or count changes this token.

The read-hash-write protocol used by `jupyter_update_cell` and
`jupyter_delete_cell`:

1. A prior `jupyter_get_cells` (or the mutation result of a previous write)
   returns a cell's live `sourceHash`.
2. The agent calls `jupyter_update_cell`/`jupyter_delete_cell` with that
   hash as `expectedSourceHash`.
3. The handler recomputes `hashCellSource` from the cell's *current* live
   source and compares it to `expectedSourceHash`.
4. On a match, the mutation proceeds. On a mismatch — because a human (or
   another tool call) changed the cell in between — the handler throws a
   structured `STALE_CELL` error carrying `expectedSourceHash`,
   `currentSourceHash`, and a bounded `currentSourcePreview`, and the write
   never happens.

This is the **STALE_CELL guarantee**: a concurrent human edit always wins.
The agent is expected to re-read the cell, see the human's new state, and
decide how to reconcile from there — the tool never silently overwrites or
discards it.

## Why correctness never depends on DOM/CSS selectors

Every operation in `src/jupyter/*` reads and writes through JupyterLab's
supported APIs: the notebook's shared model (`sharedModel.getSource()`,
`insertCell`, `deleteCell`, `setSource`), `INotebookTracker`/`NotebookPanel`
for resolving the active notebook, `CodeEditor.IEditor` for cursor/selection,
and `sessionContext`/`CodeCell.execute` for execution. None of this reads
CSS classes or DOM structure to determine notebook state, so it keeps
working across JupyterLab UI/theme changes and works identically whether or
not a cell currently has an on-screen widget.

The one deliberate exception is `src/review/markers.ts`: it toggles a CSS
class (`jp-webmcp-hasComments`) and two `data-*` attributes on cell DOM
nodes purely so a human can visually see which cells have comments without
opening the Review panel. This is cosmetic presentation layered on top of
state that is already authoritative elsewhere (`ReviewStore`); nothing reads
these DOM attributes back as a source of truth.

## Bounds (`src/limits.ts`)

| Constant | Value | Used for |
| --- | --- | --- |
| `DEFAULT_CELLS_RETURNED` | 20 | Default cell count for `jupyter_get_cells` when no explicit range is given. |
| `MAX_CELLS_RETURNED` | 100 | Hard cap on cells returned by one `jupyter_get_cells` call. |
| `MAX_WORKSPACE_ROWS` | 100 | Cap on entries returned by `jupyter_list_workspace`. |
| `MAX_CELL_SOURCE_BYTES` | 25 KiB (25 * 1024) | Cap on one cell's returned source text. |
| `MAX_TEXT_OUTPUT_BYTES` | 10 KiB (10 * 1024) | Cap on one output's serialized text (stream/result/error). |
| `MAX_TOTAL_RESULT_BYTES` | 50 KiB (50 * 1024) | Cap on the serialized size of one whole tool result's `content` text. |
| `MAX_SELECTED_TEXT_BYTES` | 4 KiB (4 * 1024) | Cap on the returned text of the human's current editor selection. |
| `MAX_COMMENT_BODY_BYTES` | 8 KiB (8 * 1024) | Cap on one comment message body. |
| `MAX_COMMENTS_RETURNED` | 50 | Cap on threads returned by `jupyter_list_comments`. |
| `MAX_OUTPUTS_PER_CELL` | 10 | Cap on outputs serialized per cell. |
| `MAX_ANCHOR_CONTEXT` | 80 | Characters of prefix/suffix context captured for source-range re-anchoring. |
| `MAX_PREVIEW_CHARS` | 400 | Length of the source preview included in `STALE_CELL` errors and comment-thread summaries. |
| `MAX_SUMMARY_CHARS` | 600 | Length of the one-line output summary returned by `jupyter_run_cells`. |

`boundJson` (`src/webmcp/results.ts`) applies `MAX_TOTAL_RESULT_BYTES` as a
final backstop on the serialized `content` text of every tool result,
independent of whichever per-field limits above already applied; if the
payload still doesn't fit, it is replaced with a small `{truncated: true,
reason, maxBytes, partial}` envelope rather than being cut off mid-JSON.
Note that `structuredContent` on a successful result is **not** put through
`boundJson` — it carries the full, unbounded payload; only the `content[0].text`
copy is bounded.

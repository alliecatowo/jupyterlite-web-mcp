# WebMCP tool reference

This document describes every tool `jupyterlite-webmcp` registers with
`document.modelContext`. Descriptions are quoted verbatim from
`src/webmcp/tools.ts`; inputs are drawn from the JSON Schemas in
`src/webmcp/schemas.ts`; outputs and bounds are drawn from the handler
implementations in `src/jupyter/*` and `src/review/*`.

## Result envelope

Every tool invocation returns the same shape (`src/webmcp/results.ts`):

```ts
{
  content: [{ type: 'text', text: string }],  // JSON, bounded to ~50 KiB
  structuredContent?: unknown,                 // the full, unbounded payload
  isError?: boolean                            // present and true on failure
}
```

On success, `structuredContent` is the handler's full return value and
`content[0].text` is that same value JSON-serialized and bounded to
`LIMITS.MAX_TOTAL_RESULT_BYTES` (50 KiB); if it doesn't fit, `content[0].text`
becomes a small `{truncated: true, reason, maxBytes, partial}` envelope
instead (`structuredContent` itself is never truncated by this backstop).

On failure, `isError` is `true`, `structuredContent` is the structured error
below, and `content[0].text` is that same error JSON-serialized.

## Structured error shape

```ts
{
  error: ErrorCode;   // one of the closed set below
  message: string;    // human-readable
  [key: string]: unknown; // optional extra fields, e.g. cellId, expectedSourceHash
}
```

Every thrown `ToolError` reduces to this shape via `normalizeError`
(`src/jupyter/errors.ts`). An unexpected exception (not a `ToolError`)
normalizes to `INTERNAL_ERROR` with its message truncated to 500 characters;
no stack trace is ever included.

### Error codes

| Code | Meaning |
| --- | --- |
| `NO_ACTIVE_NOTEBOOK` | No `notebookPath` was given and there is no notebook currently open (or, for `jupyter_list_comments` with `scope: "current-cell"`, no active cell). |
| `NOTEBOOK_NOT_FOUND` | The given path does not resolve to an open or existing notebook (or, for `jupyter_list_workspace`, an existing directory). |
| `CELL_NOT_FOUND` | No cell with the given id exists in the resolved notebook. |
| `STALE_CELL` | `expectedSourceHash` did not match the cell's current source hash; the write was refused. |
| `INVALID_PATH` | A path argument was malformed, absolute, escaped the workspace root, or used a backslash. |
| `PATH_EXISTS` | `jupyter_create_notebook` would have overwritten an existing file. |
| `INVALID_CELL_TYPE` | An unsupported cell type was requested for `jupyter_insert_cell` (only `code`/`markdown`/`raw` are valid). |
| `INVALID_ARGUMENT` | A required argument was missing or the wrong type/shape (also used for an unsupported kernel action or insert `position`). |
| `KERNEL_UNAVAILABLE` | The notebook has no kernel attached (needed by `jupyter_run_cells` or `jupyter_kernel_action`). |
| `KERNEL_BUSY` | Reserved for kernel-busy conditions; part of the closed `ErrorCode` union. |
| `EXECUTION_ERROR` | Reserved for execution failures reported through the structured error channel; per-cell execution errors from `jupyter_run_cells` are instead reported inline in that tool's own result (`status: "error"`, `ename`/`evalue`/`traceback`), not as a thrown `ErrorCode`. |
| `ABORTED` | The tool invocation's `AbortSignal` fired before or during the call. |
| `WEBMCP_UNAVAILABLE` | Reserved for the case where WebMCP is not available; the extension only registers tools once it is, so it is not normally observed by a tool caller. |
| `COMMENT_NOT_FOUND` | No review thread with the given `threadId` exists in the resolved notebook. |
| `COMMENT_ANCHOR_STALE` | A comment anchor could not be validated: the selected text is no longer present in the cell, the output index doesn't exist, or (for source-range creation via `anchor.text`) the given text was not found in the cell source. |
| `INTERNAL_ERROR` | Any unexpected failure, normalized with a truncated message and no stack trace. |

### AbortSignal behavior

Only `jupyter_run_cells` accepts and acts on an `AbortSignal` (passed through
by the WebMCP runtime as `options.signal`). If the signal is already aborted
when the tool starts, it throws `ABORTED` immediately. If it fires while a
cell this invocation started is executing, the tool sends a kernel
**interrupt** — but only while that invocation's own execution is in
flight; it never interrupts execution the human (or another tool call)
started, because the kernel is shared. Cells not yet started when an abort
fires are reported with `status: "abort"` and are not run. Every other tool
runs to completion or throws normally; there is nothing else in the
extension for an abort to usefully interrupt.

---

## Context & navigation

### `jupyter_get_context`

- **Title:** Get notebook context
- **Description:** "Read the live state of the browser-local Jupyter
  workspace: the open documents, the current notebook (including whether it
  has unsaved changes), the kernel status, the active and selected cells,
  the cursor, and the exact text the user currently has selected. Call this
  first; the selection is how the user points at something when they say
  'this'."
- **Read/write:** read-only (`readOnlyHint: true`, `untrustedContentHint: true`)
- **Inputs:** none (`{}`)
- **Output:**
  ```ts
  {
    workspace: { currentDirectory: string; openDocuments: string[] };
    notebook: INotebookInfo | null;   // null if no notebook is open
    kernel: IKernelInfo | null;
    focus: IFocusContext | null;
    review: { openThreads: number; totalThreads: number } | null;
  }
  ```
  `INotebookInfo`: `{ path, name, dirty, revision, cellCount }`.
  `IKernelInfo`: `{ name: string | null, displayName?, status }`
  (`status` one of `idle`/`busy`/`starting`/`dead`/`unavailable`/`unknown`).
  `IFocusContext`: `{ activeCellId, activeCellIndex, activeCellType,
  selectedCellIds, cursor: {line, column} | null, textSelection: {start,
  end, text, truncated?} | null }`. `textSelection` is `null` when the
  selection is empty (start === end).
- **Bounds:** `textSelection.text` bounded to `MAX_SELECTED_TEXT_BYTES` (4 KiB).
- **Errors:** none thrown; every field degrades to `null` when there is no
  current notebook.
- **Concurrency:** always reads the live model; reflects unsaved edits and
  the human's current selection at call time.

### `jupyter_list_workspace`

- **Title:** List workspace files
- **Description:** "List files and directories in the browser-local
  workspace. Returns names, paths, types, sizes and modification times,
  never file contents. Use it to find a notebook before opening it."
- **Read/write:** read-only (`readOnlyHint: true`, `untrustedContentHint: true`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `path` | string or null | workspace root |
  | `recursive` | boolean | `false` |
  | `limit` | integer, 1-100 | 100 (`MAX_WORKSPACE_ROWS`) |
- **Output:**
  ```ts
  { path: string; entries: IWorkspaceEntry[]; truncated: boolean; omittedCount: number }
  ```
  `IWorkspaceEntry`: `{ path, name, type, size?, modified? }` (`type` is
  `directory`, `notebook`, or `file` as reported by the contents manager).
  Directories sort before files; both sort alphabetically by name.
- **Bounds:** at most `limit` (capped at 100) entries; `recursive` performs
  a breadth-first walk that still respects the same cap across the whole
  walk, not per directory.
- **Errors:** `NOTEBOOK_NOT_FOUND` if the root path doesn't exist;
  `INVALID_PATH` if the root path is a file, not a directory (a
  non-existent recursive subdirectory is silently skipped rather than
  erroring, since it may have been deleted mid-walk).
- **Concurrency:** none needed; read-only.

### `jupyter_open_notebook`

- **Title:** Open a notebook
- **Description:** "Open a notebook from the workspace and bring it to the
  front, optionally scrolling to a specific cell. This visibly changes what
  the user is looking at."
- **Read/write:** write, UI state (`readOnlyHint: false`, `untrustedContentHint: true`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `path` | string (required) | — |
  | `cellId` | string or null | none |
  | `activate` | boolean | `true` |
- **Output:**
  ```ts
  { notebook: INotebookInfo; kernel: IKernelInfo; review: { openThreads, totalThreads } }
  ```
- **Bounds:** none beyond the notebook/kernel/review summary shapes above.
- **Errors:** `NOTEBOOK_NOT_FOUND` if no file exists at `path` or it is not
  a notebook; `CELL_NOT_FOUND` if `cellId` is given but doesn't exist once
  opened.
- **Concurrency:** if the notebook is already open, the existing panel (and
  its unsaved edits) is reused rather than the file being re-opened from disk.

### `jupyter_create_notebook`

- **Title:** Create a notebook
- **Description:** "Create a new, empty notebook in the browser-local
  workspace and open it. Refuses to overwrite an existing file."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `name` | string (required) | — (`.ipynb` appended if missing) |
  | `directory` | string or null | workspace root |
  | `kernel` | string or null | application default kernel |
- **Output:** `{ path: string; notebook: INotebookInfo; kernel: IKernelInfo }`
- **Bounds:** none.
- **Errors:** `INVALID_ARGUMENT` if `name` is empty/blank; `PATH_EXISTS` if
  a file already exists at the target path (nothing is overwritten);
  `INTERNAL_ERROR` in the (expected never to occur) case the created file
  cannot be reopened as a notebook. `kernel` is matched case-insensitively
  against installed kernel names, then kernel languages; an unmatched
  request silently falls back to the application default rather than
  erroring.
- **Concurrency:** the existence check and creation are not atomic against
  another concurrent creator, but this mirrors normal contents-manager usage
  elsewhere in JupyterLab.

---

## Notebook structure

### `jupyter_get_cells`

- **Title:** Read notebook cells
- **Description:** "Read cells from the live notebook model, including
  edits the user has not saved yet. Each cell comes back with its stable id
  and a sourceHash; you must pass that hash back to edit or delete the
  cell. Outputs are bounded and only included when asked for."
- **Read/write:** read-only (`readOnlyHint: true`, `untrustedContentHint: true`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `notebookPath` | string or null | current notebook |
  | `cellIds` | string[] | none — takes priority over the index range when given |
  | `startIndex` | integer >= 0 | 0 |
  | `endIndex` | integer >= 0 | `startIndex + 20` (`DEFAULT_CELLS_RETURNED`) |
  | `includeSource` | boolean | `true` |
  | `includeOutputs` | boolean | `false` |
- **Output:**
  ```ts
  { notebook: INotebookInfo; cells: ICellSnapshot[]; truncated: boolean; omittedCount: number }
  ```
  `ICellSnapshot`: `{ id, index, type, source?, sourceTruncated?, sourceHash,
  executionCount?, outputs?, outputsTruncated?, metadata? }`. `metadata` is
  only included when the cell's JSON-encoded metadata is non-empty and at
  most 512 characters.
- **Bounds:** at most `MAX_CELLS_RETURNED` (100) cells per call regardless
  of how many were requested; `source` bounded to `MAX_CELL_SOURCE_BYTES`
  (25 KiB); outputs (when requested) bounded per `serializeOutputs` (see
  below), at most `MAX_OUTPUTS_PER_CELL` (10) per cell.
- **Errors:** `CELL_NOT_FOUND` if any id in `cellIds` doesn't exist;
  `NO_ACTIVE_NOTEBOOK`/`NOTEBOOK_NOT_FOUND` from notebook resolution.
- **Concurrency:** always reads the live model; `sourceHash` is exactly
  what a subsequent `jupyter_update_cell`/`jupyter_delete_cell` must supply
  as `expectedSourceHash`.

### `jupyter_insert_cell`

- **Title:** Insert a cell
- **Description:** "Insert a new cell into the live notebook, above or
  below a reference cell. The cell is visible to the user immediately. It
  is not executed: run it with jupyter_run_cells as a separate, explicit
  step."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: true`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `notebookPath` | string or null | current notebook |
  | `referenceCellId` | string or null | the active cell |
  | `position` | `"above"` \| `"below"` | `"below"` |
  | `cellType` | `"code"` \| `"markdown"` \| `"raw"` | `"code"` |
  | `source` | string | `""` |
  | `activate` | boolean | `true` |
- **Output:** `{ notebook: INotebookInfo; cell: ICellSnapshot }` (cell
  snapshot always includes source).
- **Bounds:** none beyond the standard cell snapshot bounds.
- **Errors:** `INVALID_CELL_TYPE` for an unsupported `cellType`;
  `INVALID_ARGUMENT` for an unsupported `position`; `CELL_NOT_FOUND` if
  `referenceCellId` is given but doesn't exist.
- **Concurrency:** if the notebook is empty, the cell is appended
  regardless of `referenceCellId`/`position`. When `activate` is true (the
  default) a markdown cell with `source` is immediately rendered.

### `jupyter_update_cell`

- **Title:** Update a cell
- **Description:** "Replace the source of a visible notebook cell in the
  live model. Requires the sourceHash returned by a previous read, so an
  unsaved human edit can never be overwritten by accident: if the cell
  changed, the write is refused with a STALE_CELL error containing the
  current hash and a preview. Does not run or save the cell."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: true`)
- **Inputs (all required except `notebookPath`):**
  | Field | Type |
  | --- | --- |
  | `notebookPath` | string or null |
  | `cellId` | string |
  | `source` | string — the complete replacement source |
  | `expectedSourceHash` | string — `sourceHash` from a previous read |
- **Output:** `{ notebook: INotebookInfo; cell: ICellSnapshot }`.
- **Bounds:** standard cell-snapshot bounds on the returned cell.
- **Errors:** `INVALID_ARGUMENT` if `source` isn't a string or
  `expectedSourceHash` is missing; `CELL_NOT_FOUND`; **`STALE_CELL`** —
  ```ts
  { error: 'STALE_CELL', message: 'Cell changed since it was read.',
    cellId, expectedSourceHash, currentSourceHash, currentSourcePreview }
  ```
  (`currentSourcePreview` bounded to `MAX_PREVIEW_CHARS`, 400 characters).
- **Concurrency:** this is the read-hash-write protocol described in
  `docs/architecture.md`. Does not run or save the notebook; the notebook
  becomes dirty naturally through the normal shared-model change.

### `jupyter_delete_cell`

- **Title:** Delete a cell
- **Description:** "Delete a visible notebook cell. Requires the
  sourceHash from a previous read; a cell the user has edited since then is
  not deleted."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs (all required except `notebookPath`):** `notebookPath`,
  `cellId`, `expectedSourceHash`.
- **Output:**
  ```ts
  { notebook: INotebookInfo; deletedCellId: string; activeCellId: string | null }
  ```
- **Bounds:** none.
- **Errors:** `INVALID_ARGUMENT` if `expectedSourceHash` is missing;
  `CELL_NOT_FOUND`; `STALE_CELL` (same shape as `jupyter_update_cell`,
  message "Cell changed since it was read; it was not deleted.").
- **Concurrency:** same read-hash-write protocol as `jupyter_update_cell`.

---

## Execution

### `jupyter_run_cells`

- **Title:** Run notebook cells
- **Description:** "Execute cells that already exist in the notebook,
  using the browser-local kernel the user shares. The user sees the busy
  state, the execution counts and the outputs. There is no way to run an
  arbitrary source string: to compute something new, insert a visible cell
  first and then run it."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: true`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `notebookPath` | string or null | current notebook |
  | `cellIds` | string[] | the active cell |
  | `stopOnError` | boolean | `true` |
- **Output:**
  ```ts
  {
    status: 'ok' | 'error' | 'aborted';
    notebook: INotebookInfo;
    results: Array<{
      cellId: string; index: number;
      status: 'ok' | 'error' | 'abort' | 'no-op';
      executionCount?: number | null;
      outputSummary: string;       // bounded one-line summary
      ename?: string; evalue?: string; traceback?: string;  // on error
    }>;
  }
  ```
  Markdown cells run as a no-op that renders them; non-code/non-markdown
  (`raw`) cells run as a no-op noting they aren't executed; an empty code
  cell runs as a no-op without contacting the kernel.
- **Bounds:** `outputSummary` bounded to `MAX_SUMMARY_CHARS` (600
  characters); `traceback`/`evalue` pass through the same output serializer
  as `jupyter_get_cells` (ANSI-stripped, bounded to `MAX_TEXT_OUTPUT_BYTES`).
- **Errors:** `INVALID_ARGUMENT` if no `cellIds` were given and there is no
  active cell; `KERNEL_UNAVAILABLE` if any requested cell is a code cell and
  no kernel is attached; `CELL_NOT_FOUND` if a requested cell has no
  notebook widget (should not normally occur). Per-cell execution failures
  are **not** thrown; they are reported inline as `status: 'error'` with
  `ename`/`evalue`/`traceback` on that cell's result, and `stopOnError`
  (default `true`) stops the remaining queued cells without throwing.
- **Concurrency / AbortSignal:** honors `AbortSignal` as described above —
  an abort interrupts only execution this invocation started, via a kernel
  interrupt, and never touches work the human launched manually. Cells run
  strictly in the given order; `overall status` is `'aborted'` if any cell
  was skipped or interrupted due to the signal.

### `jupyter_focus_cell`

- **Title:** Focus a cell
- **Description:** "Scroll to a cell, select it, and optionally place the
  cursor or select an exact range of its source using the notebook
  editor's own selection. Use it to point the user at the code you are
  talking about. Changes only what is on screen."
- **Read/write:** view-state only (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:**
  | Field | Type | Notes |
  | --- | --- | --- |
  | `notebookPath` | string or null | defaults to current notebook |
  | `cellId` | string (required) | |
  | `cursor` | `{line, column}` | ignored if `selection` is also given |
  | `selection` | `{start: {line,column}, end: {line,column}}` | takes priority over `cursor` |
- **Output:** `{ notebook: INotebookInfo; focus: IFocusContext }` (see
  `jupyter_get_context` for the `IFocusContext` shape).
- **Bounds:** none.
- **Errors:** `CELL_NOT_FOUND` if `cellId` doesn't exist in the resolved
  notebook.
- **Concurrency:** activates the notebook panel, scrolls the target cell
  into view (notebooks are windowed, so a far-off-screen cell may need to be
  scrolled to before it has a live editor), then focuses the editor and
  applies the selection or cursor. This is purely a view-state change: it
  never mutates cell content.

### `jupyter_save_notebook`

- **Title:** Save the notebook
- **Description:** "Save the notebook to the browser-local workspace. The
  live in-memory model is authoritative, so this is only needed when the
  user wants the file on disk updated."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:** `{ notebookPath?: string | null }`
- **Output:** `{ saved: true; path: string; dirty: boolean }`
- **Bounds:** none.
- **Errors:** standard notebook-resolution errors
  (`NO_ACTIVE_NOTEBOOK`/`NOTEBOOK_NOT_FOUND`).
- **Concurrency:** uses the normal document `context.save()` path; no tool
  ever saves automatically after another mutation.

### `jupyter_kernel_action`

- **Title:** Interrupt or restart the kernel
- **Description:** "Interrupt or restart the browser-local kernel for a
  notebook. The kernel is shared with the user, so an interrupt also stops
  anything they started. Restarting discards every in-memory variable."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:** `{ notebookPath?: string | null; action: "interrupt" | "restart" }` (`action` required)
- **Output:**
  ```ts
  { action: string; notebookPath: string; kernel: IKernelInfo; message: string }
  ```
  `message` for `restart` explicitly states in-memory variables are lost.
- **Bounds:** none.
- **Errors:** `KERNEL_UNAVAILABLE` if `action: "interrupt"` is requested
  with no kernel attached; `INVALID_ARGUMENT` for any `action` other than
  `interrupt`/`restart`.
- **Concurrency:** only `interrupt` and `restart` are implemented (V1
  scope); both act on the one kernel shared with the human, so either
  affects anything the human had running.

---

## Review

All seven comment tools resolve the target notebook the same way as the
cell tools (`notebookPath` or the current notebook) and operate through
`ReviewStore` (`src/review/storage.ts`), the same store the Review sidebar
panel uses.

### `jupyter_list_comments`

- **Title:** List review comments
- **Description:** "List the review threads stored in a notebook. Threads
  are an ordinary notebook feature the user can also create, reply to and
  resolve by hand; they are saved in the notebook file. Each summary says
  whether the thread still points at live code or has become orphaned."
- **Read/write:** read-only (`readOnlyHint: true`, `untrustedContentHint: true`)
- **Inputs:**
  | Field | Type | Default |
  | --- | --- | --- |
  | `notebookPath` | string or null | current notebook |
  | `status` | `"open"` \| `"resolved"` \| `"all"` | `"open"` |
  | `scope` | `"notebook"` \| `"current-cell"` | `"notebook"` |
  | `limit` | integer, 1-50 | 50 (`MAX_COMMENTS_RETURNED`) |
- **Output:**
  ```ts
  {
    notebookPath: string;
    counts: { openThreads: number; totalThreads: number };
    threads: Array<{
      threadId, status, createdAt, updatedAt, messageCount,
      anchor: { kind, cellId, cellIndex, selectedText?, outputIndex?, state, outputChanged? },
      lastMessage: { author, createdAt, body } | null;  // body bounded to 400 chars
    }>;
    truncated: boolean; omittedCount: number;
  }
  ```
  Threads are sorted newest-created-first.
- **Bounds:** at most `limit` (capped at 50) threads; `lastMessage.body`
  bounded to `MAX_PREVIEW_CHARS` (400 characters).
- **Errors:** `NO_ACTIVE_NOTEBOOK` if `scope: "current-cell"` is requested
  with no active cell.
- **Concurrency:** `anchor.state`/`outputChanged` are computed live against
  the current notebook on every call (see anchor resolution in
  `docs/review-comments.md`), so a thread's anchor status always reflects
  the notebook as it exists right now, not as it existed when the thread
  was created.

### `jupyter_get_comment`

- **Title:** Read a review thread
- **Description:** "Read one review thread in full: every message, the
  anchor, whether the anchor still resolves, and the code or output it is
  attached to as it exists now."
- **Read/write:** read-only (`readOnlyHint: true`, `untrustedContentHint: true`)
- **Inputs:** `{ notebookPath?: string | null; threadId: string }` (`threadId` required)
- **Output:**
  ```ts
  {
    notebookPath: string;
    thread: IThread;              // full thread: id, status, timestamps, anchor, messages[]
    anchorStatus: IAnchorStatus;  // kind, cellId, cellExists, cellIndex, state, range?, text?, outputIndex?, outputChanged?
    context: { cell?: ICellSnapshot };  // present only if the anchored cell still exists
  }
  ```
  For an `output` anchor, `context.cell` includes outputs; for other kinds
  it includes source only.
- **Bounds:** the embedded `cell` follows the same bounds as
  `jupyter_get_cells`.
- **Errors:** `COMMENT_NOT_FOUND` if `threadId` doesn't exist in the
  resolved notebook.
- **Concurrency:** same live anchor-status computation as `jupyter_list_comments`.

### `jupyter_create_comment`

- **Title:** Create a review comment
- **Description:** "Create a review thread anchored to a whole cell, to an
  exact range of a cell's source, or to one of a cell's outputs. This is
  the same kind of comment the user creates from the Review panel, so use
  it to leave observations without editing their notebook."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs (`anchor` and `message` required):**
  ```ts
  {
    notebookPath?: string | null;
    anchor: {
      kind: 'cell' | 'source-range' | 'output';  // required
      cellId: string;                             // required
      selection?: { start: {line,column}, end: {line,column} };
      text?: string;   // source-range: exact substring to attach to (alternative to selection)
      outputIndex?: number;  // output: which output of the cell (default 0)
    };
    message: string;
  }
  ```
- **Output:** `{ notebookPath: string; thread: IThread; counts: { openThreads, totalThreads } }`
- **Bounds:** `message` bounded to `MAX_COMMENT_BODY_BYTES` (8 KiB) by the
  store; for a `source-range` anchor, the captured `selectedText` and
  prefix/suffix context follow the same bounds as human-created anchors
  (`MAX_SELECTED_TEXT_BYTES` / `MAX_ANCHOR_CONTEXT`, see
  `docs/review-comments.md`).
- **Errors:** `INVALID_ARGUMENT` if `anchor.kind`/`anchor.cellId`/`message`
  are missing, or if a `source-range` anchor supplies neither `anchor.text`
  nor `anchor.selection`; `CELL_NOT_FOUND` if `cellId` doesn't exist;
  `COMMENT_ANCHOR_STALE` if `anchor.text` isn't found in the cell's current
  source, if a `source-range` anchor's resulting selected text can't be
  validated against the live cell, or if an `output` anchor's `outputIndex`
  doesn't exist on that cell (run it first). Agent-authored comments are
  tagged with `AGENT_AUTHOR` (`{ kind: 'agent', name: 'Browser agent' }`) —
  no other vendor identity is invented.
- **Concurrency:** anchors are validated against the live notebook at
  creation time, exactly like a human-created comment; nothing here reads
  or writes cell source.

### `jupyter_reply_comment`

- **Title:** Reply to a review thread
- **Description:** "Append a message to an existing review thread. The
  user sees it in the Review panel next to their own messages."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:** `{ notebookPath?: string | null; threadId: string; message: string }` (both required)
- **Output:** `{ notebookPath: string; thread: IThread }`
- **Bounds:** `message` bounded to `MAX_COMMENT_BODY_BYTES` (8 KiB).
- **Errors:** `COMMENT_NOT_FOUND`; `INVALID_ARGUMENT` if `message` is
  empty/blank.
- **Concurrency:** appends to the thread's message list; does not touch its
  anchor or status.

### `jupyter_resolve_comment`

- **Title:** Resolve a review thread
- **Description:** "Mark a review thread resolved, optionally adding a
  closing message. The history is preserved and the user can reopen it."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:** `{ notebookPath?: string | null; threadId: string; resolutionMessage?: string | null }` (`threadId` required)
- **Output:** `{ notebookPath: string; thread: IThread }`
- **Bounds:** `resolutionMessage`, if given, bounded like any comment body.
- **Errors:** `COMMENT_NOT_FOUND`.
- **Concurrency:** sets `status: 'resolved'`; the full message history is
  preserved (nothing is deleted), and the thread can be reopened at any
  time.

### `jupyter_reopen_comment`

- **Title:** Reopen a review thread
- **Description:** "Reopen a resolved review thread, preserving its history."
- **Read/write:** write (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:** `{ notebookPath?: string | null; threadId: string }` (`threadId` required)
- **Output:** `{ notebookPath: string; thread: IThread }`
- **Bounds:** none.
- **Errors:** `COMMENT_NOT_FOUND`.
- **Concurrency:** sets `status: 'open'`; no message is appended (unlike
  `jupyter_resolve_comment`'s optional `resolutionMessage`).

### `jupyter_focus_comment`

- **Title:** Focus a review thread
- **Description:** "Scroll to what a review thread is attached to and
  select it, so the user can see exactly which code or output is under
  discussion. Changes only what is on screen."
- **Read/write:** view-state only (`readOnlyHint: false`, `untrustedContentHint: false`)
- **Inputs:** `{ notebookPath?: string | null; threadId: string }` (`threadId` required)
- **Output:**
  ```ts
  { notebookPath: string; threadId: string; anchorStatus: IAnchorStatus; notebook: INotebookInfo }
  ```
- **Bounds:** none.
- **Errors:** `COMMENT_NOT_FOUND`; `COMMENT_ANCHOR_STALE` if the anchored
  cell no longer exists at all (`cellIndex === null`) — note this is
  distinct from an *orphaned source-range* anchor (text not found but the
  cell still exists), which instead resolves and reveals the cell without a
  specific text selection.
- **Concurrency:** activates the notebook, reveals the anchored cell, and
  (for a `source-range` anchor that still resolves to a range) focuses the
  editor and applies that selection. Purely a view-state change.

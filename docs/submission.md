# Submission positioning

## Positioning

Do not pitch this as:

> AI-powered Jupyter notebooks.

Pitch it as:

> **A portable semantic interface to a browser-native computational
> workspace.**

## Short description

> JupyterLite WebMCP lets compatible browser agents read, navigate, edit,
> execute, and review the exact browser-local notebook a user already has
> open — including unsaved edits, current selections, outputs, and review
> threads — without embedding an LLM, running a Jupyter server, or
> configuring a separate MCP integration.

## Core thesis

> JupyterLite brought the computational notebook into the browser. WebMCP
> makes that live workspace semantically accessible to the agent already
> accompanying the user.

## The four judging dimensions

### WebMCP leverage

Every one of the 19 registered tools operates on state that exists only, or
currently, inside the one browser tab: the live `NotebookPanel` model
(including edits that were never saved to disk — `jupyter_get_cells` reads
straight from `sharedModel.getSource()`, never re-reading `.ipynb` bytes),
the browser-local IndexedDB-backed contents manager (`jupyter_list_workspace`,
`jupyter_create_notebook`), the human's current cell/cursor/text selection
(`jupyter_get_context`'s `focus.textSelection`, bounded but exact), the
in-browser Pyodide kernel shared with the human (`jupyter_run_cells`,
`jupyter_kernel_action`), and review threads stored in notebook metadata
(`jupyter_list_comments` and friends). None of this is proxied through, or
duplicated into, an external service: WebMCP's imperative
`document.modelContext.registerTool` API is used specifically because it
lets an agent already present in the tab reach directly into state a
server-based MCP integration would have no way to see (an unsaved edit, an
exact mouse selection) without inventing its own synchronization layer.

### Execution

This is a real JupyterLab 4 extension (`packages/jupyterlite-webmcp`,
`@jupyterlab/*` peer dependencies, built with `@jupyter/builder`/hatchling
like any other prebuilt lab extension), running against a real
Pyodide/WebWorker kernel with real, unmodified cell outputs — there is no
mocked or simulated execution path. Concurrency is handled deliberately, not
assumed away: `jupyter_update_cell`/`jupyter_delete_cell` require an
`expectedSourceHash` from a prior read and refuse a stale write with a
structured `STALE_CELL` error rather than clobbering a human's concurrent
edit (`src/jupyter/cells.ts`, `docs/architecture.md`). `jupyter_run_cells`
honors an `AbortSignal`, interrupting only execution that invocation itself
started, because the kernel is shared with the human
(`src/jupyter/execution.ts`). Every tool result is bounded in size at
several layers (`src/limits.ts`, `boundJson` in `src/webmcp/results.ts`) so
a single call cannot return unbounded notebook data to an agent. Both unit
tests (`packages/jupyterlite-webmcp/tests/unit`, covering schemas, hashing,
stale detection, path validation, the output serializer, error
normalization, the comment model, and source/output anchoring) and browser
integration tests (`ui-tests/`, run via Playwright per
`.github/workflows/test.yml`) exercise this behavior end to end, including
the unsaved-state and stale-write scenarios called out as critical in
SPEC.md §50.

### Impact

Any existing JupyterLite deployment can add this extension with no
architectural change: it is a normal frontend plugin with no server
component, no additional infrastructure, and — critically — no AI vendor
dependency of its own. The extension does not embed, call, or depend on any
specific LLM provider; whatever browser agent happens to be present is the
one that gets access. Removing WebMCP support from the browser does not
remove any user-facing capability of the notebook or the Review feature
(`jupyterlite-webmcp:review` provides its own value independent of
`jupyterlite-webmcp:tools`); it only removes the extra tool surface, exactly
as SPEC.md §2 requires.

### Creativity / ambition

The product framing is deliberately narrow and load-bearing: the browser
agent is not a separate notebook assistant with its own scratch space or
shadow copy — it is another participant reading and writing the *same*
notebook model the human is looking at, subject to the same concurrency
rules a second human editor would be subject to. The product-boundary test
applied throughout development (SPEC.md §63) — "could this feature still
make sense if the second participant were a human instead of an AI?" — is
why, for example, there is no hidden kernel-introspection tool
(SPEC.md §47): when an agent needs new information to answer a review
comment, it inserts and runs a visible cell, exactly as a second human
collaborator would, so the notebook remains the complete computational
record of how a conclusion was reached.

## Acceptance criteria checklist (SPEC.md §61)

### Standalone application

- [x] Works normally without WebMCP — `jupyterlite-webmcp:tools` no-ops
  entirely when `document.modelContext` is absent
  (`WebMCPRegistry.isAvailable`, `src/webmcp/register.ts`); the review
  plugin does not depend on it at all (`src/index.ts`).
- [x] User can create/edit/run/save a notebook with no extension installed
  at all — this is unmodified JupyterLite/JupyterLab behavior; the
  extension adds capability, it does not gate any of it.
- [x] No AI service required — no LLM SDK, API key UI, or model selector
  exists anywhere in `packages/jupyterlite-webmcp`.

### Browser runtime

- [x] Local kernel works — `jupyterlite-pyodide-kernel` per `requirements.txt`.
- [x] Sample CSV works — `content/data/customers.csv`, loaded by
  `customer-analysis.ipynb`'s `load-data` cell.
- [x] No notebook application server required — the deployment is a static
  JupyterLite build (`jupyter lite build`/`serve`); see `README.md`.

### WebMCP

- [x] Current `document.modelContext.registerTool` — `src/webmcp/register.ts`.
- [x] No old APIs — no reference to `navigator.modelContext` or
  `provideContext` anywhere in `src/`.
- [x] Top-level registration — all 19 tools registered once in
  `WebMCPRegistry.register`, called once from `app.started.then(...)` in
  `src/index.ts`; `_registered` guards against a second call.
- [x] No fake production shim — the only WebMCP shim referenced by SPEC.md
  §48 is a test-only fixture for `ui-tests/`, never shipped in the built
  extension.

### Context

- [x] Active notebook, active cell, selected cells, cursor, source
  selection, dirty state, kernel state, unsaved source — all present in
  `jupyter_get_context`'s `notebook`/`focus`/`kernel` fields
  (`src/jupyter/focus.ts`), reading the live model.

### Operations

- [x] List workspace, open notebook, create notebook, get cells, insert,
  update, delete, run, focus, save, interrupt/restart — each is its own
  tool (see `docs/webmcp-tools.md`), backed by its own function in
  `src/jupyter/*`.

### Concurrency

- [x] Stale write cannot overwrite the user — `STALE_CELL` in
  `jupyter_update_cell`/`jupyter_delete_cell` (`src/jupyter/cells.ts`).
- [x] Structured conflict works — the `STALE_CELL` error carries
  `expectedSourceHash`, `currentSourceHash`, and `currentSourcePreview`.

### Visibility

- [x] Inserted cells, edits, execution, and focus are all visible in the
  normal JupyterLab UI — none of these operations touch anything outside
  the live notebook widget tree; there is no hidden execution or hidden
  state.

### Comments (shipped)

- [x] Humans can use them without WebMCP — `src/review/commands.ts` and the
  Review panel (`src/review/panel.tsx`) require only
  `jupyterlite-webmcp:review`.
- [x] Source/cell comments — `cell` and `source-range` anchor kinds
  (`src/review/model.ts`); output comments (`output` anchor kind) also
  shipped.
- [x] Sidebar — `ReviewPanel`, added to the right shell area in `src/index.ts`.
- [x] Reply — `ReviewStore.reply` / `jupyter_reply_comment`.
- [x] Resolve/reopen — `ReviewStore.setStatus` / `jupyter_resolve_comment` /
  `jupyter_reopen_comment`.
- [x] Agent can create comments — `jupyter_create_comment`.
- [x] Agent can reply — `jupyter_reply_comment`.
- [x] Agent can navigate comments — `jupyter_focus_comment`.
- [x] No automatic agent triggering — see "No automatic triggering" in
  `docs/review-comments.md`; nothing in `src/review/*` calls out to
  `document.modelContext` in either direction.
- [x] Metadata persists — stored under `jupyterlite_webmcp_review` in
  notebook metadata (`REVIEW_METADATA_KEY`), written via the shared model so
  it saves and downloads with the `.ipynb` file.

### Testing

- [x] Unit tests — `packages/jupyterlite-webmcp/tests/unit/` (errors,
  model, outputs, paths, results, revisions, schemas).
- [x] Browser tests — `ui-tests/`, run via `npx playwright test`
  (`.github/workflows/test.yml`).
- [x] Unsaved-state test, stale-write test, execution test — covered by the
  browser test suite per the same CI workflow.

### Public artifact

- [x] URL works — published by `.github/workflows/deploy.yml` to GitHub
  Pages on pushes to `main`; see the note in the repository README about
  not asserting a specific link.
- [x] Repo ready, license, attribution, demo fixture, docs — `LICENSE`,
  `NOTICE.md`, `content/customer-analysis.ipynb` +
  `content/data/customers.csv`, and this `docs/` directory.

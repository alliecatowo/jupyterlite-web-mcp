# Submission: The WebMCP Challenge

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

This is judged on four equally weighted criteria: WebMCP Leverage,
Execution, Potential Impact, and Creativity & Ambition. What follows makes
the case for each with specifics from this repository, not adjectives.

## WebMCP Leverage (25%)

Every one of the 22 registered tools operates on state that exists **only**
inside one browser tab, with no backend an ordinary MCP server could talk
to: the live `NotebookPanel` model, including edits never saved to disk
(`jupyter_get_cells` reads `sharedModel.getSource()` directly, never
re-reading `.ipynb` bytes from a file); the browser-local, IndexedDB-backed
contents manager (`jupyter_list_workspace`, `jupyter_create_notebook`); the
human's current cell/cursor/text selection
(`jupyter_get_context`'s `focus.textSelection`, bounded but exact); the
in-browser Pyodide kernel shared with the human (`jupyter_run_cells`,
`jupyter_kernel_action`); and review threads stored in notebook metadata
(`jupyter_list_comments` and friends). None of this is proxied through or
duplicated into an external service. WebMCP's imperative
`document.modelContext.registerTool` API is used specifically because it
lets an agent already present in the tab reach directly into state a
server-based MCP integration has no way to see — an unsaved edit, an exact
mouse selection — without inventing a synchronization layer to fake it.

## Execution (25%)

This is a real JupyterLab 4.6 extension (`packages/jupyterlite-webmcp`,
built with `@jupyter/builder`/hatchling like any other prebuilt lab
extension) running against a real Pyodide/WebWorker kernel with real,
unmodified cell outputs — no mocked or simulated execution path. Concurrency
is handled deliberately: `jupyter_update_cell`/`jupyter_delete_cell` require
an `expectedSourceHash` from a prior read and refuse a stale write with a
structured `STALE_CELL` error rather than clobbering a human's concurrent
edit (`src/jupyter/cells.ts`). `jupyter_run_cells` honors an `AbortSignal`,
interrupting only execution that invocation itself started, since the
kernel is shared with the human (`src/jupyter/execution.ts`). Every tool
result is bounded in size at several layers (`src/limits.ts`, `boundJson` in
`src/webmcp/results.ts`) so a single call cannot return unbounded notebook
data to an agent.

The deployment is served cross-origin isolated (`COOP: same-origin`, `COEP:
credentialless`) — verified `crossOriginIsolated === true` with
`SharedArrayBuffer` available — so the Pyodide kernel runs on a real
`SharedArrayBuffer` worker instead of the slower service-worker fallback;
GitHub Pages cannot set the required headers, which is why the demo is
hosted on Vercel instead. 218 unit tests (jest) and 37 browser integration
tests (Playwright, against the built static site) run in CI
(`.github/workflows/test.yml`) alongside ESLint, Prettier, and `tsc`, all
green. In Chrome 150 with WebMCP enabled, driven through the real
`document.modelContext`, all 22 tools register, `getTools()` returns them
with annotations intact, and `executeTool()` round-trips end to end.

## Potential Impact (25%)

Any existing JupyterLab, Notebook 7, or JupyterLite deployment can add this
extension with no architectural change: a normal frontend plugin, no server
component, no additional infrastructure, no AI vendor dependency of its own.
Verified directly, not just claimed: `jupyter labextension list` reports it
enabled in a real JupyterLab 4.6 server and a real Notebook 7 server, a full
open → read → update → context round trip succeeds in both, and
`jupyter_run_cells` executed `print(2 + 2)` on a real ipykernel returning
`4` with `executionCount: 1` — no code changes were needed to move from
JupyterLite's in-browser Pyodide kernel to a server-backed ipykernel.
Jupyter's existing installed base — JupyterLab, Notebook 7, and every
JupyterLite site — is the addressable audience, and any deployment can add
it with one line in `requirements.txt`. The extension does not embed, call,
or depend on any specific LLM provider; whatever browser agent happens to
be present is the one that gets access. Removing WebMCP support from the
browser removes no user-facing capability of the notebook or the Review
feature (`jupyterlite-webmcp:review` stands on its own); it only removes
the extra tool surface.

## Creativity & Ambition (25%)

The product framing is deliberately narrow and load-bearing: the browser
agent is not a separate notebook assistant with its own scratch space — it
is another participant reading and writing the *same* notebook model the
human is looking at, under the same concurrency rules a second human editor
would be. The review conversation is a first-class part of this: an agent
can create, reply to, resolve, and reopen threads anchored to a cell, an
exact source range, or an output, and that conversation is stored in the
`.ipynb` file's own metadata (`jupyterlite_webmcp_review`), so it travels
with the notebook when downloaded — not a chat log that evaporates when the
tab closes.

The product-boundary test applied throughout development — "could this
feature still make sense if the second participant were a human instead of
an agent?" — is why there is no hidden kernel-introspection tool: to answer
a review comment, the agent inserts and runs a visible cell, exactly as a
human collaborator would, so the notebook stays the complete computational
record of how a conclusion was reached. The same logic makes pointing
bidirectional: the agent can scroll the human's notebook to an exact
expression (`jupyter_focus_cell`, `jupyter_focus_comment`), and the human
can select code by hand and have the agent read exactly that substring
(`focus.textSelection`) — the two participants point at things the way a
pair of humans at one keyboard would.

## What this is not

No LLM dependency, no API key UI, no chat panel, no sidebar assistant, no
"Ask AI" button, no model selector. WebMCP has no way for a page to wake,
summon, or notify an agent — editing a cell, running something, or adding a
review comment never calls anyone; it changes the live state an agent will
see the next time a human invokes it.

## Artifacts

- Live demo: <https://jupyterlite-web-mcp.vercel.app/lab/index.html>
- Repository: <https://github.com/alliecatowo/jupyterlite-web-mcp>
- License: MIT (`LICENSE`); third-party attribution in `NOTICE.md`.
- Demo fixture: `content/customer-analysis.ipynb` + `content/data/customers.csv`.
- Full docs: `docs/architecture.md`, `docs/webmcp-tools.md`,
  `docs/webmcp-compatibility.md`, `docs/review-comments.md`,
  `docs/install.md`.

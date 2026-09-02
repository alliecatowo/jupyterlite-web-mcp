# JupyterLite WebMCP

> **Your notebook is already in the browser. Now your agent can be too.**

<!--
DEMO PLACEHOLDER: a ~2-2.5 minute screen recording (GIF or video) goes here,
following docs/demo-script.md. It has not been recorded yet.

What you'd see:
- Scene A: ordinary JupyterLite, a cell run by hand, no AI product visible.
- Scene B: "Open the customer analysis notebook" — the notebook opens.
- Scene C: the human mouse-selects `converted / visitors` and asks the agent
  to fix just that; the source, execution count, and chart update in place.
- Scene D: the human hand-edits an earlier filter cell and runs it, then asks
  the agent to add a comparison below the chart without disturbing the edit.
- Scene E: "Where is churn actually calculated?" — the notebook scrolls to
  and highlights the relevant cell.
-->

## What it is

JupyterLite WebMCP is a JupyterLab 4 frontend extension. It runs entirely in
the browser — no server extension, no backend, no external Jupyter server —
and works inside a JupyterLite deployment exactly like this repository's own
public site. It exposes the live JupyterLite workspace through the [WebMCP](
https://github.com/webmachinelearning/webmcp) browser API
(`document.modelContext.registerTool`), so a compatible browser agent can
read, navigate, edit, run, and review the *same* browser-local notebook the
human already has open: the same unsaved edits, the same active cell, the
same selection, the same outputs, the same kernel, and the same review
threads.

JupyterLite already brings notebooks, files, kernels, and interactive
computation into the browser. JupyterLite WebMCP lets a compatible browser
agent participate in that exact live workspace without embedding an AI model
or requiring a separate Jupyter server/MCP integration.

This is **not** an AI application. There is no LLM dependency, no API key
UI, no chat panel, no sidebar assistant, no "Ask AI" button, and no model
selector. WebMCP is pure progressive enhancement: with no WebMCP-capable
agent present, the extension still ships a fully usable notebook and a
normal Review/comments feature, and JupyterLite behaves exactly like an
unmodified JupyterLite deployment.

## Why WebMCP?

JupyterLite already keeps important state entirely inside one browser
origin: the open notebooks, unsaved edits, uploaded files, the IndexedDB-backed
workspace, the current editor focus and selection, the in-browser Python
kernel, live Python state, interactive widget state, and review comments.
There is often no Jupyter application server for a traditional MCP
integration to connect to. WebMCP instead lets a compatible browser agent
enter the exact environment the human already has open, rather than
requiring a second, separately-configured integration boundary.

### Same notebook

The agent reads and writes the live `NotebookPanel` model the human is
looking at — not a copy, not bytes re-read from disk. Unsaved edits are
visible to the agent immediately, and edits the agent makes are visible to
the human immediately.

### Same kernel

Cells run on the one browser-local Pyodide kernel the human's notebook is
already attached to. There is no separate agent kernel and no hidden
execution path; anything the agent runs shows up as a normal execution the
human can see and interrupt.

### Same files

The agent lists, opens, and creates files through the same JupyterLite
contents manager (backed by IndexedDB) that the file browser uses. Nothing
is synced from or to an external store.

### Same focus

The agent can read exactly what the human has selected (down to the exact
substring of source text) and can, in turn, scroll to and select a cell or
an exact range of code so the human sees precisely what the agent means.

### No server integration

There is no companion Jupyter server, no MCP server process, and no bridge
process of any kind. The extension is a normal JupyterLab frontend plugin;
any JupyterLite deployment can add it.

## Human + agent example

```text
Human opens an existing notebook, runs analysis, edits a filter,
selects a suspicious expression, and asks the browser agent:
"Is this right? Fix just this."

Agent reads the exact current notebook and selection, edits the
visible cell, and runs it.

Human sees the chart update, then manually changes an earlier cell.

Agent's next action continues from the human's new state, not the
stale version it read before.
```

See `docs/demo-script.md` for the full shot-by-shot version of this
interaction, and `docs/submission.md` for the product positioning.

## Review comments

Review is an ordinary notebook feature, not an AI feature: a human can
create, reply to, resolve, reopen, and navigate threaded comments anchored
to a cell, an exact range of source text, or a cell output, entirely without
a browser agent, from a right-sidebar "Review" panel. Comments are stored in
the notebook's own metadata (see `docs/review-comments.md`), so they travel
with the downloaded `.ipynb` file — no comment server, no account service.

A compatible browser agent can participate in the same threads through
seven WebMCP tools: it can list and read threads, create new ones, reply,
resolve, reopen, and navigate to one. Nothing about creating or replying to
a comment calls or notifies the agent — see `docs/review-comments.md` and
the WebMCP compatibility notes below.

## Tools

19 tools are registered. Full documentation, including inputs, outputs,
bounds, and error codes, is in `docs/webmcp-tools.md`.

| Tool | Read/Write | Purpose |
| --- | --- | --- |
| `jupyter_get_context` | read | Live workspace, notebook, kernel, focus and selection state. |
| `jupyter_list_workspace` | read | List files/directories in the browser-local workspace. |
| `jupyter_open_notebook` | write (UI) | Open a notebook and bring it to the front. |
| `jupyter_create_notebook` | write | Create and open a new, empty notebook. |
| `jupyter_get_cells` | read | Read live cells, including unsaved edits, with source hashes. |
| `jupyter_insert_cell` | write | Insert a visible cell; never executes it. |
| `jupyter_update_cell` | write | Replace a cell's source, guarded by a source hash. |
| `jupyter_delete_cell` | write | Delete a cell, guarded by a source hash. |
| `jupyter_run_cells` | write | Execute existing cells on the shared kernel. |
| `jupyter_focus_cell` | write (view) | Scroll to, select, and set the cursor/selection in a cell. |
| `jupyter_save_notebook` | write | Save the notebook to the browser-local workspace. |
| `jupyter_kernel_action` | write | Interrupt or restart the shared kernel. |
| `jupyter_list_comments` | read | List review threads for a notebook. |
| `jupyter_get_comment` | read | Read one review thread in full, with anchor status. |
| `jupyter_create_comment` | write | Create a review thread (cell, source-range, or output). |
| `jupyter_reply_comment` | write | Append a message to an existing thread. |
| `jupyter_resolve_comment` | write | Mark a thread resolved, preserving history. |
| `jupyter_reopen_comment` | write | Reopen a resolved thread. |
| `jupyter_focus_comment` | write (view) | Scroll to and select what a thread is anchored to. |

## Architecture

See `docs/architecture.md` for the full picture. In short:

```text
JupyterLab APIs -> src/jupyter/* adapter -> semantic operations -> src/webmcp/* adapter
```

The two plugins are `jupyterlite-webmcp:review` (the notebook comment
feature; works with or without WebMCP) and `jupyterlite-webmcp:tools` (the
WebMCP tool registration, which depends on the review plugin so it can
expose comment tools).

## Local development

```bash
# Python environment (uv is used in this repo; python -m venv also works)
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# Build the extension
cd packages/jupyterlite-webmcp
npm install
npm run build:prod
cd ../..

# Build and serve the JupyterLite site
.venv/bin/jupyter lite build --contents content --output-dir dist
.venv/bin/jupyter lite serve --output-dir dist
```

`requirements.txt` installs `packages/jupyterlite-webmcp` in editable mode,
so the extension is picked up automatically.

A public build of this repository is published by
`.github/workflows/deploy.yml` to GitHub Pages on pushes to `main`; the
exact URL depends on where this repository is hosted, so check the
repository's GitHub Pages settings rather than assuming a specific link.

## Testing

```bash
cd packages/jupyterlite-webmcp && npm test        # unit tests (jest)
cd packages/jupyterlite-webmcp && npm run typecheck
cd ui-tests && npm install && npx playwright test  # browser tests
```

`.github/workflows/test.yml` runs the same three steps, plus a build of the
extension and the JupyterLite site, on every push and pull request.

## Security

Notebook content — cell source, outputs, and comment bodies — is untrusted
user data: it can contain text written to look like an instruction to an
agent. Every tool that can return notebook content sets
`untrustedContentHint: true` in its WebMCP annotations, so a well-behaved
agent can treat it as data rather than as commands.

Execution only ever happens through the explicit `jupyter_run_cells` tool,
on cells that already visibly exist in the notebook. There is no way to
execute an arbitrary source string, and there is no hidden kernel
introspection tool: if an agent needs to compute something new (for example
to answer a review comment), it must insert a visible cell and run it, the
same way a human would.

Every write tool that mutates a cell's source (`jupyter_update_cell`,
`jupyter_delete_cell`) requires the `sourceHash` from a previous read. If the
cell changed in the meantime, the write is refused with a structured
`STALE_CELL` error rather than silently overwriting a human's edit.

The extension never reads or exposes cookies, browser auth tokens, unrelated
`localStorage`, or any secret outside the notebook workspace itself. Tool
results are bounded in size (see the limits table in `docs/architecture.md`)
so a single call cannot return an unbounded amount of notebook data.

## WebMCP compatibility

The extension uses the current imperative
`document.modelContext.registerTool()` API. It does not use the obsolete
`navigator.modelContext` or `provideContext` APIs, and it does not implement
the declarative (HTML-attribute) form of WebMCP. Tools are registered once,
at plugin activation, and are never unregistered or re-registered as the
notebook, cell focus, cursor, selection, or kernel state changes — those are
state changes, not capability changes, and every tool reads current state
when it is invoked. Long-running tool invocations (`jupyter_run_cells`)
honor the `AbortSignal` passed by the WebMCP runtime, but an abort only
interrupts execution *that invocation itself started* — the kernel is
shared with the human, so the tool never interrupts work the human launched
manually.

**WebMCP cannot wake, summon, or notify an agent.** Selecting code, editing
a cell, moving a widget slider, or adding or replying to a review comment
never calls the agent and never triggers anything automatically. These
actions simply change the live state that a browser agent will see the next
time the human invokes it.

## License / attribution

This project is MIT licensed; see `LICENSE`. The deployment substrate
(JupyterLite build/config layout, `requirements.txt` pins, and the GitHub
Pages workflow) is derived from `jupyterlite/demo` (BSD 3-Clause, Copyright
Project Jupyter Contributors). `jupyterlab-ai-commands` (BSD 3-Clause,
Project Jupyter) was studied as an implementation reference for JupyterLab
notebook, cell, and execution plumbing; it is not a runtime dependency and
no code from it was copied verbatim. Full third-party attribution is in
`NOTICE.md`.

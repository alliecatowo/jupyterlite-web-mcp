# ONE-SHOT BUILD CONTRACT — JUPYTERLITE WEBMCP

> **This is the original build brief, kept for provenance.** It states what
> was *asked for*, not what shipped — some illustrative strings here (status
> bar wording, tool counts) were superseded during implementation. For the
> shipped behavior see [`README.md`](README.md); for the verified state of
> the code see [`docs/audit-verdict.md`](docs/audit-verdict.md).

Build this project completely.

Do not stop after scaffolding, architecture, a prototype, or partial tool registration. Continue until the extension works end-to-end, the public JupyterLite deployment works, tests pass, the demo fixture is polished, the repository is submission-ready, and the WebMCP Challenge requirements are satisfied.

Do not ask routine implementation questions. Inspect upstream code and resolve implementation details yourself.

When an implementation choice is ambiguous, optimize for:

1. correctness
2. native Jupyter behavior
3. smallest robust architecture
4. visible shared human/agent state
5. WebMCP correctness
6. demo quality
7. minimal bespoke UI

Do not invent features merely because an agent can implement them.

---

# 1. PRODUCT

Working name:

**JupyterLite WebMCP**

Tagline:

> **Your notebook is already in the browser. Now your agent can be too.**

Technical description:

> A JupyterLab frontend extension that exposes the exact live JupyterLite workspace through WebMCP, allowing a compatible browser agent to read, navigate, edit, run, and review the same browser-local notebook the human is already using.

The important word is **same**.

Same:

* notebook
* unsaved cell edits
* active cell
* selected cells
* cursor
* source selection
* outputs
* uploaded files
* browser-local kernel
* execution state
* notebook review comments

No shadow copy.

No separate agent notebook.

No external Jupyter server.

No backend MCP bridge.

---

# 2. THIS IS NOT AN AI APPLICATION

The application must remain fully useful if WebMCP does not exist.

A normal user must be able to use it exactly as a normal JupyterLite installation:

* open notebooks
* create notebooks
* upload files
* browse files
* edit cells
* run cells
* inspect outputs
* interact with widgets
* save notebooks
* download notebooks
* restart kernels
* use plots
* use tables
* use the review/comment feature if implemented

There must be:

* no LLM dependency
* no OpenAI SDK
* no Anthropic SDK
* no API key UI
* no built-in chat
* no AI sidebar
* no automatic agent invocation
* no sparkle button
* no “Ask AI”
* no model selector
* no hidden inference
* no server-side agent
* no MCP server
* no special agent-only computational backend

WebMCP is **progressive enhancement**.

The page describes its existing semantic capabilities to whatever compatible browser agent accompanies the user.

---

# 3. WHY THIS IS WEBMCP

JupyterLite is particularly appropriate because important workspace state can exist entirely inside one browser origin/session:

* notebooks
* unsaved changes
* uploaded files
* IndexedDB-backed workspace
* current editor focus
* current text selections
* current outputs
* in-browser Python kernel
* live Python state
* interactive widget state
* review comments stored with the notebook

There may be no Jupyter application server to connect an ordinary MCP server to.

A traditional persistent MCP integration would require creating another integration boundary.

WebMCP instead lets an agent enter the environment the human already has open.

The core experience is:

```text
Human edits notebook
        ↓
Agent sees exact new state
        ↓
Agent edits/runs notebook
        ↓
Human sees exact changes/output
        ↓
Human manually changes something
        ↓
Agent continues from that new state
```

And, optionally:

```text
Human reviews notebook
        ↓
Leaves comments/questions directly on code/results
        ↓
Agent later reads unresolved threads
        ↓
Agent replies or investigates visibly
        ↓
Human replies/resolves
```

---

# 4. UPSTREAM REPOSITORY STRATEGY

## Deployment substrate

Start from the official:

```text
jupyterlite/demo
```

repository/template.

Do NOT fork JupyterLite core unless there is no supported extension API capable of implementing a required feature.

Use the versions currently pinned by the official demo repository.

Do not gratuitously upgrade:

* JupyterLite
* JupyterLab
* Pyodide kernel
* widget packages
* build infrastructure

First prove the untouched upstream demo builds and runs.

Only then add the extension.

Preserve all required BSD licensing and upstream attribution.

---

# 5. REFERENCE IMPLEMENTATIONS TO STUDY / CARGO-CULT CAREFULLY

## A. `jupyter-ai-contrib/jupyterlab-ai-commands`

Study this repository as implementation reference for Jupyter plumbing.

Specifically inspect patterns for:

* resolving the active notebook
* resolving a notebook by path
* operating on the live notebook model
* avoiding stale on-disk notebook reads
* stable notebook cell IDs
* inserting cells
* editing cells
* deleting cells
* opening notebooks
* creating notebooks
* running notebook cells
* handling outputs
* execution errors
* focus/navigation

Do NOT:

* depend on it at runtime
* reproduce its AI product surface
* copy an embedded chat interface
* use its model integrations

Independently implement the needed behavior against supported JupyterLab APIs.

If meaningful source is directly copied, preserve legally required attribution.

---

## B. JupyterLab extension examples

Study official extension examples for:

* frontend plugin structure
* side panels
* metadata
* commands
* kernel messaging
* notebook tracking
* status bar
* settings
* JupyterLite compatibility

Prefer patterns explicitly demonstrated as JupyterLite-compatible.

---

## C. `jupyterlab/jupyterlab-commenting`

There is historic prior art for notebook/file commenting.

Study it only for interaction ideas and anchoring concepts.

Do NOT assume it is current or JupyterLite-compatible.

Do NOT require its server component.

Our review implementation must remain frontend-only/browser-compatible.

---

# 6. REPOSITORY STRUCTURE

Adapt exact packaging to JupyterLab extension conventions, but converge toward:

```text
jupyterlite-webmcp/
├── .github/
│   └── workflows/
│       ├── deploy.yml
│       └── test.yml
│
├── content/
│   ├── README.md
│   ├── customer-analysis.ipynb
│   ├── scratch.ipynb
│   └── data/
│       └── customers.csv
│
├── packages/
│   └── jupyterlite-webmcp/
│       ├── package.json
│       ├── pyproject.toml
│       ├── README.md
│       ├── LICENSE
│       │
│       ├── src/
│       │   ├── index.ts
│       │   │
│       │   ├── jupyter/
│       │   │   ├── workspace.ts
│       │   │   ├── notebook.ts
│       │   │   ├── cells.ts
│       │   │   ├── execution.ts
│       │   │   ├── focus.ts
│       │   │   ├── outputs.ts
│       │   │   ├── revisions.ts
│       │   │   └── errors.ts
│       │   │
│       │   ├── webmcp/
│       │   │   ├── register.ts
│       │   │   ├── schemas.ts
│       │   │   ├── tools.ts
│       │   │   ├── results.ts
│       │   │   └── types.ts
│       │   │
│       │   ├── review/
│       │   │   ├── model.ts
│       │   │   ├── anchors.ts
│       │   │   ├── storage.ts
│       │   │   ├── commands.ts
│       │   │   ├── panel.tsx
│       │   │   └── markers.ts
│       │   │
│       │   └── ui/
│       │       └── status.ts
│       │
│       ├── style/
│       │   └── index.css
│       │
│       └── tests/
│           ├── unit/
│           └── fixtures/
│
├── ui-tests/
│   ├── playwright.config.ts
│   ├── webmcp-shim.ts
│   └── *.spec.ts
│
├── docs/
│   ├── architecture.md
│   ├── webmcp-tools.md
│   ├── webmcp-compatibility.md
│   ├── review-comments.md
│   ├── multiplayer.md
│   ├── install.md
│   └── agent-collaboration-roadmap.md
│
├── jupyter-lite.json
├── requirements.txt
├── README.md
├── SUBMISSION.md
├── DEMO.md
├── CHECKLIST.md
├── CODEX_DRIVER.md
├── LICENSE
└── NOTICE.md
```

If the upstream demo strongly suggests a different monorepo structure, preserve its conventions rather than fighting them.

Separation of concerns matters more than exact filenames.

---

# 7. ARCHITECTURE

Build one ordinary JupyterLab frontend extension.

It must work in JupyterLite without a server extension.

Conceptually:

```text
┌────────────────────────────────────────────┐
│                 Browser                    │
│                                            │
│  JupyterLab UI                             │
│       ↕                                    │
│  Live notebook model                       │
│       ↕                                    │
│  JupyterLite contents + IndexedDB          │
│       ↕                                    │
│  Pyodide/WebWorker kernel                  │
│                                            │
│              ↕                             │
│      jupyterlite-webmcp                    │
│              ↕                             │
│      document.modelContext                 │
└──────────────┬─────────────────────────────┘
               │
               ▼
      compatible browser agent
```

The WebMCP layer must be thin.

Implement Jupyter operations independently from WebMCP first.

Recommended dependency direction:

```text
Jupyter APIs
    ↓
Jupyter adapter
    ↓
semantic operations
    ↓
WebMCP adapter
```

NOT:

```text
WebMCP callbacks containing huge piles of Jupyter logic
```

---

# 8. JUPYTER APIS

Use supported JupyterLab APIs.

Likely relevant APIs/tokens include:

* `JupyterFrontEnd`
* `INotebookTracker`
* `NotebookPanel`
* `NotebookActions`
* notebook model/shared model APIs
* `IDocumentManager`
* document context
* contents manager
* session context
* kernel APIs
* `CodeEditor.IEditor`

Do not rely on DOM querying for authoritative notebook state.

DOM inspection may only be used for optional cosmetic presentation when no public API exists.

Correctness must not depend on CSS selectors.

---

# 9. WEBMCP LIFECYCLE

At plugin activation:

1. feature-detect:

```ts
document.modelContext
```

2. If WebMCP is unavailable:

   * extension must not crash
   * all normal notebook/review functionality remains available
   * status UI may say `WebMCP unavailable`

3. If WebMCP is available:

   * register tools once
   * maintain stable registration for application lifetime
   * use current imperative APIs
   * support tool AbortSignals

Use:

```ts
document.modelContext.registerTool(...)
```

Do not use obsolete:

```text
navigator.modelContext
provideContext
```

Do not implement declarative WebMCP.

Do not dynamically unregister/re-register tools when:

* cell focus changes
* notebook changes
* cursor moves
* kernel becomes busy
* comments change

Those are STATE changes.

Tools query current state when invoked.

Do not abuse `toolchange`.

---

# 10. CRITICAL WEBMCP LIMITATION

WebMCP cannot independently wake, summon, or notify an agent when something changes.

Therefore:

* selecting code does NOT call the agent
* changing a cell does NOT call the agent
* moving a slider does NOT call the agent
* adding a comment does NOT call the agent
* replying to a comment does NOT call the agent
* executing a cell does NOT call the agent

These simply change the live state available the next time the human invokes the browser agent.

Do not imply otherwise anywhere.

---

# 11. CORE PRODUCT PRINCIPLE

Expose semantic equivalents of actions already meaningful in Jupyter.

Prefer visible notebook operations.

Good:

```text
insert a visible cell
edit a visible cell
run a visible cell
focus code
open a notebook
reply to a visible review comment
```

Bad:

```text
run invisible arbitrary Python
secretly query kernel objects
secretly modify data
use hidden scratch execution unavailable to user
```

The notebook should remain the computational record.

---

# 12. CORE TOOL SURFACE

Implement the following coherent V1 tool set.

Use stable names.

Recommended names below.

---

## 12.1 `jupyter_get_context`

READ ONLY.

Returns bounded live context.

Conceptual result:

```json
{
  "workspace": {
    "currentDirectory": "",
    "openDocuments": [
      "customer-analysis.ipynb"
    ]
  },
  "notebook": {
    "path": "customer-analysis.ipynb",
    "name": "customer-analysis.ipynb",
    "dirty": true,
    "revision": "rev...",
    "cellCount": 12
  },
  "kernel": {
    "name": "python",
    "status": "idle"
  },
  "focus": {
    "activeCellId": "...",
    "activeCellIndex": 5,
    "activeCellType": "code",
    "selectedCellIds": ["..."],
    "cursor": {
      "line": 3,
      "column": 14
    },
    "textSelection": {
      "start": {"line": 3, "column": 8},
      "end": {"line": 3, "column": 27},
      "text": "converted / visitors"
    }
  },
  "review": {
    "openThreads": 3
  }
}
```

Only return fields that can be implemented reliably.

If there is no current notebook:

```json
{
  "notebook": null
}
```

must be valid.

Bound selected text.

This is critical for:

> “fix this”

after the user manually selected exact code.

---

# 13. FOCUS / SELECTION CONTEXT

Support:

* active notebook
* active cell
* selected cells
* editor cursor
* editor selection

Use notebook selection APIs and CodeEditor APIs.

Do NOT trigger anything based on focus.

Focus is contextual state.

Important bidirectional interaction:

### Human → agent

Human selects:

```python
converted / visitors
```

and says:

> “Is this right?”

Agent sees exact selected range.

### Agent → human

Agent calls `jupyter_focus_cell`.

Jupyter scrolls to and selects:

```python
converted / visitors
```

Human immediately sees the referent.

This is a major demo feature.

---

# 14. `jupyter_list_workspace`

READ ONLY.

Inputs:

```json
{
  "path": "",
  "recursive": false,
  "limit": 100
}
```

Return:

* path
* name
* type
* size if available
* modified date if available
* truncation information

Do not return file contents.

Do not recursively dump workspace.

Enables:

> “Open the notebook I was working on.”

---

# 15. `jupyter_open_notebook`

UI-state mutation.

Input:

```json
{
  "path": "customer-analysis.ipynb",
  "cellId": null,
  "activate": true
}
```

Behavior:

* validate path
* open using normal Jupyter mechanisms
* activate panel
* optionally focus specific cell
* scroll into view
* return resulting context

This must visibly switch the Jupyter UI.

---

# 16. `jupyter_create_notebook`

MUTATING.

Input:

```json
{
  "name": "scratch-analysis",
  "directory": "",
  "kernel": "python"
}
```

Create a normal notebook.

Do not overwrite.

Open it.

Return:

* path
* notebook metadata
* kernel information

---

# 17. `jupyter_get_cells`

READ ONLY.

Read from the LIVE notebook model.

If notebook is open and dirty, results MUST include unsaved edits.

Do not reload stale `.ipynb` bytes.

Inputs:

```json
{
  "notebookPath": null,
  "cellIds": [],
  "startIndex": 0,
  "endIndex": 10,
  "includeSource": true,
  "includeOutputs": false
}
```

Return each cell:

```json
{
  "id": "...",
  "index": 4,
  "type": "code",
  "source": "...",
  "sourceHash": "...",
  "executionCount": 8,
  "outputs": [],
  "metadata": {}
}
```

Preserve stable notebook cell IDs.

Use cell hashes for stale-write protection.

Outputs must be bounded.

---

# 18. OUTPUT SERIALIZATION

Support at least:

* stream output
* `text/plain`
* execute result
* errors
* traceback
* text/html summary
* image metadata

Do NOT send giant base64 outputs.

Example image representation:

```json
{
  "mimeType": "image/png",
  "bytes": 218402,
  "included": false
}
```

For rich tables, include bounded textual/HTML-derived preview if practical.

Always indicate truncation.

Centralize limits.

Reasonable starting limits:

```text
default cells returned: 20
max workspace rows: 100
max cell source in one result: ~25 KB
max individual text output: ~10 KB
max total tool result text: ~50 KB
```

Tune if needed.

---

# 19. `jupyter_insert_cell`

MUTATING.

Input:

```json
{
  "notebookPath": null,
  "referenceCellId": null,
  "position": "below",
  "cellType": "code",
  "source": "...",
  "activate": true
}
```

Defaults:

* current notebook
* current active cell
* below

Behavior:

* modify live model
* create normal notebook cell
* preserve undo semantics if Jupyter APIs permit
* optionally focus it
* visibly scroll into view

Return:

* cell ID
* index
* source hash

DO NOT execute automatically.

Insertion and execution must be separate explicit operations.

---

# 20. `jupyter_update_cell`

MUTATING.

Input:

```json
{
  "notebookPath": null,
  "cellId": "...",
  "source": "...",
  "expectedSourceHash": "..."
}
```

`expectedSourceHash` is REQUIRED.

Before mutation:

1. calculate current source hash
2. compare
3. if mismatch, refuse

Structured failure:

```json
{
  "error": "STALE_CELL",
  "message": "Cell changed since it was read.",
  "cellId": "...",
  "expectedSourceHash": "...",
  "currentSourceHash": "...",
  "currentSourcePreview": "..."
}
```

Never silently overwrite human edits.

After update:

* notebook becomes dirty naturally
* return new hash

Do not automatically run.

Do not automatically save.

---

# 21. `jupyter_delete_cell`

MUTATING.

Input:

```json
{
  "notebookPath": null,
  "cellId": "...",
  "expectedSourceHash": "..."
}
```

Prefer hash requirement.

Reject stale delete.

Delete through normal notebook APIs.

Return deleted ID and resulting active cell.

---

# 22. `jupyter_run_cells`

MUTATING COMPUTATIONAL STATE.

Input:

```json
{
  "notebookPath": null,
  "cellIds": ["..."],
  "stopOnError": true
}
```

Only run cells that visibly exist in notebook.

NO arbitrary source string argument.

Use normal Jupyter execution APIs.

User must see:

* busy state
* execution count
* output
* traceback

Return bounded execution summary.

Example:

```json
{
  "status": "ok",
  "results": [
    {
      "cellId": "...",
      "executionCount": 9,
      "status": "ok",
      "outputSummary": "..."
    }
  ]
}
```

Honor AbortSignal.

If a tool invocation is aborted while execution it initiated is running, make a best effort to interrupt appropriately.

Be cautious: kernel interrupt affects shared kernel.

Do not interrupt unrelated manually-started work.

---

# 23. `jupyter_focus_cell`

VIEW-STATE mutation only.

Input:

```json
{
  "notebookPath": null,
  "cellId": "...",
  "cursor": {
    "line": 4,
    "column": 2
  },
  "selection": {
    "start": {
      "line": 4,
      "column": 2
    },
    "end": {
      "line": 5,
      "column": 17
    }
  }
}
```

Behavior:

* open notebook if necessary
* activate cell
* scroll cell into view
* focus editor if appropriate
* set cursor
* set source selection using native editor APIs

Prefer native CodeMirror/Jupyter selection rendering.

No custom AI highlight required.

---

# 24. `jupyter_save_notebook`

MUTATING PERSISTED WORKSPACE.

Input:

```json
{
  "notebookPath": null
}
```

Use normal document save.

Return:

```json
{
  "saved": true,
  "path": "...",
  "dirty": false
}
```

Do NOT save after every agent edit unless existing Jupyter autosave naturally does so.

The live open notebook model is authoritative.

---

# 25. `jupyter_kernel_action`

MUTATING.

Input:

```json
{
  "notebookPath": null,
  "action": "interrupt"
}
```

or:

```json
{
  "action": "restart"
}
```

Only implement:

* interrupt
* restart

for V1.

Return clear status.

Restart response should state that in-memory kernel variables are lost.

---

# 26. HASHING / CONCURRENCY

Implement deterministic cell source hashing.

Conceptual input:

```text
cellType + "\0" + source
```

No cryptographic security requirement.

Notebook revision may be:

* monotonic model revision

or deterministic combination of:

* cell IDs
* cell types
* source hashes

Cell hash protection matters most.

Human state always wins.

Example required behavior:

```text
Agent reads cell → hash A
Human edits cell
Agent tries write with hash A
        ↓
STALE_CELL
        ↓
Agent rereads
        ↓
Agent reconciles new human state
```

Test this explicitly.

---

# 27. ERROR MODEL

Use structured errors.

At minimum:

```text
NO_ACTIVE_NOTEBOOK
NOTEBOOK_NOT_FOUND
CELL_NOT_FOUND
STALE_CELL
INVALID_PATH
INVALID_CELL_TYPE
KERNEL_UNAVAILABLE
KERNEL_BUSY
EXECUTION_ERROR
ABORTED
WEBMCP_UNAVAILABLE
COMMENT_NOT_FOUND
COMMENT_ANCHOR_STALE
INTERNAL_ERROR
```

Avoid leaking enormous internal stack traces into tool results.

Never swallow failures.

---

# 28. SECURITY

Treat notebook contents as untrusted user data.

Notebook markdown/code may contain text attempting to instruct an agent.

Where WebMCP annotations support it, mark relevant content appropriately.

Never expose:

* cookies
* browser auth tokens
* unrelated localStorage
* secrets outside normal workspace content
* hidden browser capabilities

Never execute notebook content simply because notebook text requests it.

Execution occurs only through explicit execution tool invocations.

---

# 29. MINIMAL UI

Do not redesign JupyterLab.

Optional small status indicator:

```text
WebMCP ready
```

or:

```text
WebMCP · 12 tools
```

Possible diagnostic popover:

```text
registered tools
last tool invoked
success/error
timestamp
```

No chat.

No prompt history.

No model UI.

No sparkle button.

---

# 30. SAMPLE CONTENT

Ship deterministic local demo content.

Recommended:

```text
customer-analysis.ipynb
data/customers.csv
```

Fields:

```text
customer_id
plan
region
signup_month
monthly_spend
sessions
converted
churned
```

Dataset should contain:

* obvious normal rows
* one explainable outlier
* enough data for grouping/charting
* deterministic results

No network dependency.

---

# 31. DEMO NOTEBOOK

Notebook should resemble real exploratory work.

Suggested cells:

## Markdown

```markdown
# Customer growth scratchpad

Exploring paid-user conversion, spend, and churn by region.
```

## Load data

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/customers.csv")
df.head()
```

## Working filter

```python
working = df[df["plan"] != "free"].copy()
```

## Aggregate

Create a realistic metric calculation.

Include one subtle but understandable bug suitable for demo selection/fixing.

Example denominator mistake.

## Table

Produce a table containing one large outlier.

## Plot

Produce an attractive chart.

## Widget

If already reliable in JupyterLite, include one ordinary `ipywidgets` slider.

Do not make direct WebMCP widget manipulation core.

The user can manually tweak it.

Agent sees resulting notebook/output state on next invocation.

---

# 32. GOLDEN V1 DEMO

Target under roughly 2½ minutes.

## Scene A — normal JupyterLite

Open public deployment.

Explain briefly:

> “This is ordinary JupyterLite. The notebook, files, and Python kernel run in the browser.”

Manually execute a cell.

Show no AI product has been embedded.

---

## Scene B — open a browser-local notebook

Ask browser agent:

> “Open the customer analysis notebook.”

Agent:

```text
jupyter_list_workspace
jupyter_open_notebook
```

Notebook visibly opens.

---

## Scene C — human points through native UI

Human clicks buggy cell.

Mouse-select only:

```python
converted / visitors
```

Ask:

> “This looks wrong. Fix just what I selected and rerun it.”

Agent:

```text
jupyter_get_context
jupyter_get_cells
jupyter_update_cell
jupyter_run_cells
```

Visibly:

* exact source changes
* execution count changes
* output/plot changes

---

## Scene D — human modifies state

Manually change earlier filter:

```python
working = df[
    (df["plan"] != "free") &
    (df["region"] == "West")
].copy()
```

Run manually.

Ask:

> “Keep my filter. Add a comparison to the overall paid-customer baseline underneath the chart.”

Agent rereads live notebook and inserts a visible new cell.

Agent runs it.

Human's edit must remain.

---

## Scene E — agent points back

Ask:

> “Where is churn actually calculated?”

Agent invokes:

```text
jupyter_focus_cell
```

Notebook scrolls to the relevant source and highlights exact expression.

This demonstrates:

```text
human selection → agent context
agent focus     → human context
```

---

# 33. REVIEW / THREADED COMMENTS

This is the highest-priority enhancement after core cell functionality.

If the implementation proves reasonably contained, implement it before submission because it substantially strengthens the human/agent collaboration story.

It must nevertheless remain an ordinary notebook feature.

Humans can use comments without WebMCP.

Agents participate through WebMCP.

---

# 34. COMMENTS ARE NOT “AI COMMENTS”

Do not label them:

```text
AI Review
Ask AI
Agent comment mode
```

Call feature simply:

```text
Review
Comments
```

Like Docs.

Users can:

* create comments
* reply
* resolve
* reopen
* browse threads
* navigate anchors

without any browser agent.

---

# 35. COMMENT TYPES

Support, in priority order:

## A. Whole-cell comments

Anchor to stable cell ID.

Easy and robust.

## B. Source-range comments

User selects exact source text and creates comment.

Anchor to:

* cell ID
* selected source
* original range
* source hash
* surrounding context

## C. Whole-output comments

Anchor to:

* cell ID
* output index
* output fingerprint

Useful for:

> “Why does this graph look like this?”

or:

> “Why is this table weird?”

Do not block implementation waiting for arbitrary graph-coordinate annotations.

---

# 36. COMMENT UX

Add a normal Jupyter right-sidebar panel:

```text
Review
```

Filters:

```text
Open
Resolved
All
Current cell
```

Thread card example:

```text
Cell 6 · source

“converted / visitors”

You
Is this denominator correct?

Browser agent
No. `visitors` includes sessions where checkout
was never shown. The earlier funnel uses
`eligible_sessions`.

Reply
Resolve
```

Clicking a thread:

* navigates to notebook
* scrolls to cell
* highlights source when applicable
* scrolls output into view for output comments

---

# 37. HUMAN CREATES COMMENT

For source text:

1. select code
2. context menu or unobtrusive native action:
   `Add comment`
3. enter comment
4. thread appears in Review panel
5. subtle marker appears on anchored content

Do not add agent branding.

Whole-cell comments should be creatable from a cell menu/context action.

Whole-output comments should have an unobtrusive comment action attached to output area.

---

# 38. AGENT MUST ALSO BE ABLE TO LEAVE COMMENTS

This is REQUIRED if Review is implemented.

This enables:

> “Review this notebook, but don't edit it. Leave comments where you see problems.”

Agent can inspect notebook and create ordinary comment threads.

Human sees them in same Review panel.

Examples:

```text
💬 This groupby drops records where region is null.

💬 This conclusion is stronger than what the confidence interval supports.

💬 The denominator here differs from the funnel definition above.

💬 This cell mutates `working`, so rerunning cells out of order changes later results.
```

Human can:

* reply
* resolve
* edit notebook manually
* ask follow-up questions

Agent-created comments use exactly the same underlying model as human-created comments.

No special “AI annotation” format.

---

# 39. COMMENT STORAGE

Keep comments notebook-owned and browser-compatible.

Prefer notebook metadata:

```json
{
  "webmcp_review": {
    "version": 1,
    "threads": []
  }
}
```

Use an appropriately unique namespace if a better package-specific name is chosen.

No external database.

No comment server.

No account service.

Comments should travel with/download inside the notebook unless Jupyter notebook compatibility makes a sidecar dramatically safer.

Prefer notebook metadata.

---

# 40. COMMENT THREAD MODEL

Conceptual schema:

```json
{
  "id": "uuid",
  "status": "open",
  "createdAt": "...",
  "updatedAt": "...",

  "anchor": {
    "kind": "source-range",
    "cellId": "...",

    "sourceRange": {
      "start": {"line": 4, "column": 13},
      "end": {"line": 4, "column": 33}
    },

    "selectedText": "converted / visitors",
    "selectedTextHash": "...",
    "prefix": "conversion = ",
    "suffix": "\n"
  },

  "messages": [
    {
      "id": "...",
      "author": {
        "kind": "human",
        "name": null
      },
      "createdAt": "...",
      "body": "Is this denominator correct?"
    }
  ]
}
```

Agent message:

```json
{
  "author": {
    "kind": "agent",
    "name": "Browser agent"
  }
}
```

Do not invent vendor identity.

---

# 41. SOURCE COMMENT REANCHORING

Line numbers alone are insufficient.

Store:

* stable cell ID
* selected text
* selected-text hash
* original range
* short prefix
* short suffix

When source changes:

1. test original range
2. if selection text still matches, use it
3. otherwise search same cell for unique selected text/context
4. if unique, re-anchor
5. otherwise mark anchor orphaned

Never attach to the wrong text silently.

Display orphaned state in Review panel.

Allow manual re-anchoring if reasonable.

---

# 42. OUTPUT COMMENT ANCHORING

For V1 review implementation:

```text
cellId
outputIndex
mimeType
output fingerprint
```

If cell is rerun and output changes:

retain thread.

Show:

> Output changed since this comment was created.

Do not destroy review history.

Fine-grained row/plot selection is optional future work.

---

# 43. COMMENT WEBMCP TOOLS

If comments are implemented, add:

---

## `jupyter_list_comments`

READ ONLY.

Input:

```json
{
  "notebookPath": null,
  "status": "open",
  "scope": "notebook",
  "limit": 50
}
```

Scope values:

```text
notebook
current-cell
```

Return bounded thread summaries.

---

## `jupyter_get_comment`

READ ONLY.

Input:

```json
{
  "threadId": "..."
}
```

Return:

* messages
* status
* anchor
* current anchor validity
* relevant source/output context

---

## `jupyter_create_comment`

MUTATING REVIEW STATE.

Agent can create same comments as human.

Input concept:

```json
{
  "notebookPath": null,
  "anchor": {
    "kind": "source-range",
    "cellId": "...",
    "selection": {
      "start": {...},
      "end": {...}
    }
  },
  "message": "..."
}
```

Also support:

```text
cell
output
```

anchors.

Validate anchor against current notebook.

---

## `jupyter_reply_comment`

MUTATING REVIEW STATE.

Input:

```json
{
  "threadId": "...",
  "message": "..."
}
```

Append visible thread message.

---

## `jupyter_resolve_comment`

MUTATING REVIEW STATE.

Input:

```json
{
  "threadId": "...",
  "resolutionMessage": null
}
```

Mark resolved.

Preserve history.

---

## `jupyter_reopen_comment`

MUTATING REVIEW STATE.

Input:

```json
{
  "threadId": "..."
}
```

Reopen resolved thread.

---

## `jupyter_focus_comment`

VIEW STATE ONLY.

Input:

```json
{
  "threadId": "..."
}
```

Navigate to anchor.

---

# 44. REVIEW-FIRST AGENT WORKFLOW

This is a key product flow.

Human has run an analysis.

Notebook includes:

* code
* table
* chart

Human notices suspicious things.

Human leaves:

```text
💬 Why is this denominator different?
```

on code.

And:

```text
💬 Why is customer C such a huge outlier?
```

on table output.

Then human invokes agent:

> “Go through my unresolved comments. Don't change my existing cells.”

Agent:

1. lists comments
2. reads relevant cells/output
3. answers denominator directly if sufficient evidence exists
4. replies to comment

For outlier, if further computation is necessary:

DO NOT execute hidden Python.

Instead:

5. insert visible investigation cell, e.g.

```python
df[df["customer_id"] == "C"]
```

6. execute cell
7. inspect visible result
8. reply:

> Customer C contains duplicated legacy transactions. I added the investigation below the table.

This is desirable because notebook records how conclusion was reached.

---

# 45. AGENT REVIEW WITHOUT MUTATION

Support:

> “Review this notebook and leave comments, but don't change or run anything.”

Agent can:

* read cells
* read existing outputs
* create comments
* focus issues

without cell mutation.

This should be an excellent demo or README example.

---

# 46. REVIEW DEMO

If polished enough, use comments in the main challenge video.

Possible sequence:

### Human

Run notebook.

Look at table.

Comment:

> “why is this row such an outlier?”

Look at calculation.

Select expression.

Comment:

> “is this denominator right?”

### Agent invocation

> “Can you go through my unresolved notebook comments?”

Agent sees both.

Replies to denominator thread.

For outlier:

* creates one investigation cell
* executes it
* replies

### Agent review

Then:

> “Also review the rest without changing anything. Leave comments where something looks suspicious.”

Agent creates two comments.

Human clicks one.

Notebook navigates to exact cell/source.

Human replies:

> “This one is intentional.”

Agent can later resolve or reply when invoked again.

This has a very strong collaborative-document feeling while remaining a normal notebook product.

---

# 47. DO NOT ADD HIDDEN KERNEL INTROSPECTION FOR COMMENTS

Important.

Suppose output came from:

```python
df.head()
```

and full `df` remains in memory.

Do not create:

```text
secret_eval_python("...")
inspect_any_kernel_variable
```

just to answer comments.

That undermines the shared-computation model.

If additional computation is required, agent should create a visible investigation cell.

This gives the user:

* transparency
* reproducibility
* history
* control

---

# 48. TEST-ONLY WEBMCP SHIM

Automated browser tests need a fake:

```ts
document.modelContext
```

that:

* captures registered tools
* records definitions
* allows invoking callbacks
* passes inputs
* supplies AbortSignal
* records results

TEST ONLY.

Production uses real feature detection.

Never ship a fake production WebMCP polyfill.

---

# 49. UNIT TESTS

Cover:

* JSON schemas
* tool result bounds
* cell hashing
* stale detection
* path validation
* notebook resolution
* output serializer
* error normalization
* comment model serialization
* source comment reanchoring
* orphan detection
* output fingerprinting

---

# 50. BROWSER / INTEGRATION TESTS

Use Playwright/Galata where practical.

Mandatory:

## Extension

* JupyterLite loads
* extension loads
* no duplicate WebMCP registration

## No WebMCP

* app works when API absent
* notebook manually editable/runnable

## Context

* open notebook
* activate cell
* context reports it
* place cursor
* context reports cursor
* select source
* context reports source selection

## Unsaved state

* mutate live notebook without save
* tool sees new source

CRITICAL.

## Insert

* invoke insert
* cell visibly appears

## Update

* read hash
* update
* source visibly changes

## Stale protection

* read hash
* human/model manually modifies cell
* attempt old-hash update
* `STALE_CELL`
* human change survives

CRITICAL.

## Delete

* delete target cell correctly

## Execution

Insert:

```python
print(2 + 2)
```

Run.

Normal output displays `4`.

## Error

Run cell raising exception.

Tool returns structured error.

Notebook remains usable.

## Focus

* focus cell
* active cell changes
* source selection visibly changes

## Open notebook

* multiple notebooks
* tool switches correctly

## Save

* dirty true
* save
* dirty false

## Comments if implemented

* human creates whole-cell thread
* human creates source-range thread
* comments persist
* list tool returns them
* agent/tool creates comment
* agent replies
* human replies
* resolve
* reopen
* focus thread
* source anchor survives harmless edit
* invalid source anchor becomes orphaned rather than wrong
* output-change indicator works

---

# 51. BUILD / CI

All documented commands must actually run.

Maintain simple workflow.

Conceptually:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# build extension
...

# build JupyterLite
jupyter lite build

# serve
jupyter lite serve
```

Use actual commands appropriate to final packaging.

Do not put fictional commands in README.

CI should:

1. install Python deps
2. install JS deps
3. build extension
4. build JupyterLite
5. run type checks/lint
6. run unit tests
7. run browser tests

---

# 52. DEPLOYMENT

Public HTTPS URL.

Prefer GitHub Pages using upstream demo's deployment machinery.

Requirements:

* no authentication
* top-level JupyterLite page
* no iframe
* sample content preloaded
* kernel works
* extension works
* WebMCP feature detection works

---

# 53. README

README should be submission quality.

Structure:

```text
# JupyterLite WebMCP

tagline

demo GIF/video

## What it is

## Why WebMCP?

### Same notebook
### Same kernel
### Same files
### Same focus
### No server integration

## Human + agent example

## Review comments

## Tools

## Architecture

## Local development

## Testing

## Security

## WebMCP compatibility

## License / attribution
```

Critical sentence:

> JupyterLite already brings notebooks, files, kernels, and interactive computation into the browser. JupyterLite WebMCP lets a compatible browser agent participate in that exact live workspace without embedding an AI model or requiring a separate Jupyter server/MCP integration.

---

# 54. TOOL DOCUMENTATION

Create:

```text
docs/webmcp-tools.md
```

For every tool document:

* name
* title
* description
* read/write
* inputs
* defaults
* outputs
* bounds
* errors
* concurrency semantics

Tool descriptions should be agent-oriented, not marketing copy.

Example:

```text
jupyter_update_cell

Replace the source of a visible notebook cell in the live notebook model.
Requires the source hash returned by a previous read so an unsaved human
edit cannot be overwritten accidentally. Does not run or save the cell.
```

---

# 55. REVIEW DOCUMENTATION

Create:

```text
docs/review-comments.md
```

Explain:

* comments are normal notebook functionality
* no agent required
* storage model
* anchor semantics
* agent participation
* no automatic triggering
* orphan handling
* output handling

---

# 56. DEMO SCRIPT FILE

Create:

```text
DEMO.md
```

Include exact clicks, prompts, expected tool invocations and expected visible results.

Keep public demo below Challenge video limit.

Aim for approximately 2–2½ minutes.

---

# 57. SUBMISSION POSITIONING

Do NOT pitch:

> AI-powered Jupyter notebooks.

Pitch:

> **A portable semantic interface to a browser-native computational workspace.**

Four judging dimensions:

## WebMCP leverage

Important state exists only/currently in browser:

* unsaved notebook
* local workspace
* current focus
* local kernel
* outputs
* review threads

WebMCP operates directly on that state.

## Execution

Real Jupyter extension.

Real kernel.

Real outputs.

Concurrency guards.

Abort handling.

Bounded tool results.

Integration tests.

## Impact

Any JupyterLite deployment could add this extension.

No AI vendor dependency.

No application backend.

## Creativity / ambition

The browser agent becomes another participant in a computational document rather than a separate notebook assistant.

---

# 58. WHAT NOT TO BUILD

Unless everything above is done, do NOT add:

* terminal tools
* full code-console support
* invisible arbitrary kernel eval
* package installer tools
* widget mutation tools
* browser notification system
* background monitoring
* WebMCP resources
* subscriptions
* Channels
* custom agent protocol
* embedded model
* chat UI
* remote Jupyter support
* real-time multi-human CRDT backend
* arbitrary graphical plot-region annotations
* custom visual notebook editor
* dependency graph
* agent planning UI

---

# 59. PRIORITY ORDER

Work in this order.

## Phase 0 — upstream verification

* clone official demo
* install
* build
* run
* execute Pyodide cell

No changes yet.

## Phase 1 — extension shell

* add frontend extension
* prove it loads in JupyterLite

## Phase 2 — Jupyter semantic adapter

Implement:

* active notebook
* live cell reads
* selection/focus
* list workspace
* open/create notebook
* insert
* update
* delete
* save
* run
* kernel actions
* hashes

Test independently of WebMCP.

## Phase 3 — WebMCP layer

* schemas
* registration
* annotations
* structured results
* AbortSignal
* bounds

## Phase 4 — browser tests

Especially:

* unsaved state
* stale writes
* visible execution
* focus

## Phase 5 — demo notebook/data

Make beautiful but deterministic.

## Phase 6 — review/comments

Implement if core V1 is stable.

Priority inside comments:

1. whole-cell thread
2. source-range thread
3. sidebar
4. human create/reply/resolve
5. WebMCP list/get/reply
6. agent create comments
7. output comments
8. reanchoring polish

## Phase 7 — docs/deployment

## Phase 8 — hostile audit

---

# 60. HOSTILE AUDIT

Before declaring done, specifically search for:

* stale disk reads
* hidden arbitrary execution
* writes without expected hash
* accidental overwriting of human edits
* huge output dumps
* base64 image dumping
* DOM-dependent correctness
* duplicate registrations
* old WebMCP APIs
* fake production modelContext
* iframe deployment
* comments requiring backend
* AI-specific comments
* unsupported claims about triggering agents
* broken README commands
* unlicensed copied code
* missing attribution
* missing public license
* secrets
* TODOs in core flows

Fix them.

---

# 61. ACCEPTANCE CRITERIA

Do not consider project complete until:

## Standalone application

* works normally without WebMCP
* user can create/edit/run/save notebook
* no AI service required

## Browser runtime

* local kernel works
* sample CSV works
* no notebook application server required

## WebMCP

* current `document.modelContext.registerTool`
* no old APIs
* top-level registration
* no fake production shim

## Context

* active notebook
* active cell
* selected cells
* cursor
* source selection
* dirty state
* kernel state
* unsaved source

## Operations

* list workspace
* open notebook
* create notebook
* get cells
* insert
* update
* delete
* run
* focus
* save
* interrupt/restart

## Concurrency

* stale write cannot overwrite user
* structured conflict works

## Visibility

* inserted cells visible
* edits visible
* execution visible
* focus visible

## Comments if shipped

* humans can use them without WebMCP
* source/cell comments
* sidebar
* reply
* resolve/reopen
* agent can create comments
* agent can reply
* agent can navigate comments
* no automatic agent triggering
* metadata persists

## Testing

* unit tests
* browser tests
* unsaved-state test
* stale-write test
* execution test

## Public artifact

* URL works
* repo ready
* license
* attribution
* demo fixture
* docs

---

# 62. GOLDEN FINAL INTERACTION

Optimize the entire product around making this interaction flawless:

```text
HUMAN
opens an existing notebook
runs analysis
moves a widget / edits a filter
selects a suspicious expression
        ↓
asks browser agent:
“Is this right? Fix just this.”
        ↓
AGENT
reads exact current notebook + selection
edits visible cell
runs visible cell
        ↓
HUMAN
sees chart update
manually changes an earlier cell
        ↓
AGENT
continues from the human's new state,
not the stale version
```

Then, if comments ship:

```text
HUMAN
looks at resulting table
comments on output:
“Why is this row such an outlier?”

comments on code:
“Are we sure this denominator is right?”
        ↓
later asks:
“Go through my unresolved comments.”
        ↓
AGENT
reads threads
answers one directly
adds a visible investigation cell for the other
runs it
replies to thread
        ↓
then human asks:
“Review the rest but don't change anything.”
        ↓
AGENT
leaves ordinary anchored comments
        ↓
HUMAN
clicks/replies/resolves them in normal Jupyter UI
```

That is the product.

---

# 63. PRODUCT BOUNDARY TEST

At every feature ask:

> Could this feature still make sense if the second participant were a human instead of an AI?

If yes, good.

Examples:

* edit notebook together
* point to selected code
* open another notebook
* leave review comments
* reply to review comments
* resolve discussion
* run visible investigation

If no, scrutinize it.

Protocol safety mechanisms are exceptions:

* structured schemas
* output bounding
* stale hashes
* abort handling

Those exist to expose the normal application safely.

---

# 64. FINAL COPY

## Headline

> **Your notebook is already in the browser. Now your agent can be too.**

## Short description

> JupyterLite WebMCP lets compatible browser agents read, navigate, edit, execute, and review the exact browser-local notebook a user already has open—including unsaved edits, current selections, outputs, and review threads—without embedding an LLM, running a Jupyter server, or configuring a separate MCP integration.

## Core thesis

> JupyterLite brought the computational notebook into the browser. WebMCP makes that live workspace semantically accessible to the agent already accompanying the user.

---

# 65. SHIP IT

Do not merely implement the APIs.

Make the experience feel native.

A judge should be able to understand it visually:

1. human edits notebook
2. agent edits same notebook
3. human selects code
4. agent knows exactly what was selected
5. agent points code back to human
6. notebook executes in-place
7. human comments directly on a result
8. agent later participates in the same review thread

No AI application was added.

No external integration was configured.

The notebook simply became agent-accessible.

Build the complete version.


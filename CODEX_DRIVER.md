# CODEX_DRIVER.md — external verification protocol

You are an **external agent** with a WebMCP-capable browser. Your job is to
verify this submission **from the flows, not the code**: drive the live
deployment through its real `document.modelContext` tool surface, watch
what changes on screen, and file a pass/fail report. Do not read the
repository source; everything you need is below.

## 1. Setup

1. Open the live deployment in your WebMCP-capable browser:
   `https://jupyterlite-web-mcp.vercel.app/lab/index.html`
2. Confirm the status bar (bottom-right of the JupyterLab shell) reads
   `WebMCP ready`. If it reads `WebMCP unavailable`, your browser does
   not expose `document.modelContext` — stop and report `SETUP-BLOCKED`. If
   it reads `WebMCP error`, hover it for the registration error and report
   `SETUP-BLOCKED` with that text.
3. Click the status-bar item. A popup opens, in this order: a plain-language
   line stating the page published **22** notebook tools; a note that the
   page cannot wake, summon or notify an agent and does not know whether one
   is watching; `Recent invocations:`; and `Tools (22):` listing all 22
   names. Confirm the count is 22 and the names match the table below, and
   that the popup paints an opaque background — no notebook text may show
   through it. `document.modelContext.getTools()` (or your client's tool
   list) must agree.

   Note on wording: the idle status reads `WebMCP ready`, never "agent
   connected". That is deliberate — a page cannot detect an agent. Report a
   FAIL if any idle or unavailable status string claims an agent is present.
4. Use the notebook `customer-analysis.ipynb` (workspace root). Open it
   once by hand so the kernel starts; wait for the kernel status to read
   idle before running anything. Kernel work below uses the cells already
   in that notebook. Cell ids you will need (stable, in file order):
   `intro-md`, `load-data`, `funnel-def`, `filter-md`,
   `working-filter`, `conversion-rate`, `by-region-md`, `region-table`,
   `region-chart`, `widget-md`, `spend-widget`.
5. For destructive checks (delete/insert), create a scratch notebook first
   via `jupyter_create_notebook` (`name: "codex-scratch"`) and do them
   there. Restore `customer-analysis.ipynb` afterward by re-downloading it
   from the repo if you altered it (or just leave scratch files; never
   leave `customer-analysis.ipynb` dirty at the end — save or revert by
   hand).

How to invoke a tool: call it by name with the JSON args given, exactly as
your WebMCP client invokes page tools. Every result is a
`{content, structuredContent, isError}` envelope whose text is JSON.

How to set access as the human (no tool can do this — that is the point):
- **Cell access:** right-click a cell → the `Agent Access: …` menu entry
  (shows the current level: Editable / Read only / Hidden). Clicking it
  cycles `write → read → none → write`.
- **Notebook access:** right-click the notebook in the file browser →
  `Agent Access: Notebook…`, same cycle; or use the Agent panel (right
  sidebar) → Access tab → the per-notebook dropdown (`write`/`read`/`none`)
  plus the apply-to-all-cells control.

## 2. Per-tool checklist

For each row: call exactly as shown, check the result, then check the
visible UI/state change. Mark each tool PASS or FAIL.

| # | Tool + exact call | Expected result | Expected visible change |
| --- | --- | --- | --- |
| 1 | `jupyter_get_context` `{}` | `notebook.path` is the open file, `focus.activeCellId` matches the cell you clicked, `kernel.status` is `idle`/`busy` | None (pure read) |
| 2 | `jupyter_list_workspace` `{"path": ""}` | Lists `customer-analysis.ipynb` and `data`, never any `content` field | None |
| 3 | `jupyter_open_notebook` `{"path": "customer-analysis.ipynb"}` | Returns `notebook`, `kernel`, `focus`, `review` | Notebook visibly opens and comes to front |
| 4 | `jupyter_create_notebook` `{"name": "codex-scratch"}` | Returns new `path`, does not overwrite (repeat call → `PATH_EXISTS` error) | New empty notebook visibly opens |
| 5 | `jupyter_get_cells` `{"notebookPath": "customer-analysis.ipynb", "startIndex": 0, "endIndex": 3, "includeOutputs": false}` | 3 cells with `id`, `source`, `sourceHash`; `hiddenCellCount: 0` | None |
| 6 | `jupyter_get_cell_access` `{"notebookPath": "customer-analysis.ipynb", "startIndex": 0, "endIndex": 3}` | Each entry has `cellId`, `access: "write"`, `history` array | None |
| 7 | `jupyter_insert_cell` on `codex-scratch` `{"source": "x = 1", "position": "below"}` | Returns new cell `id`/`index`/`sourceHash`; cell NOT executed (no `executionCount`) | New visible cell appears in the notebook |
| 8 | `jupyter_update_cell` on the inserted cell with its `sourceHash` | Returns new hash; repeat with the OLD hash → structured `STALE_CELL` error with `currentSourceHash` + preview | Cell source visibly changes; notebook goes dirty |
| 9 | `jupyter_delete_cell` on the inserted cell with its latest hash | Returns `deletedCellId`; repeat → `CELL_NOT_FOUND` | Cell visibly disappears |
| 10 | `jupyter_run_cells` `{"notebookPath": "customer-analysis.ipynb", "cellIds": ["load-data"]}` | `status: "ok"`, per-cell `executionCount` + `outputSummary` | Busy indicator, then execution count + outputs appear in the cell |
| 11 | `jupyter_focus_cell` `{"notebookPath": "customer-analysis.ipynb", "cellId": "region-table"}` | Returns `focus` with `activeCellId: "region-table"` | Notebook scrolls to and selects that cell |
| 12 | `jupyter_save_notebook` `{"notebookPath": "codex-scratch.ipynb"}` | `{saved: true, dirty: false}` | Dirty indicator clears |
| 13 | `jupyter_kernel_action` `{"notebookPath": "customer-analysis.ipynb", "action": "interrupt"}` | Interrupt acknowledgment (kernel keeps working after) | Brief busy flicker at most; notebook state intact |
| 14 | `jupyter_list_comments` `{"notebookPath": "customer-analysis.ipynb", "status": "all"}` | `counts` + `threads` array (may be empty) | None |
| 15 | `jupyter_create_comment` anchor `{"kind": "cell", "cellId": "conversion-rate"}`, `message: "codex probe"` | Returns thread with your message, author `agent` | Thread appears in the Agent panel → Comments tab |
| 16 | `jupyter_get_comment` with that `threadId` | Full thread, `anchorStatus.state` valid, `context.cell` present | None |
| 17 | `jupyter_reply_comment` with that `threadId`, `message: "codex follow-up"` | Thread now has 2 messages | Reply visible in the Comments tab |
| 18 | `jupyter_focus_comment` with that `threadId` | Returns `anchorStatus` + `notebook` | Notebook scrolls to the anchored cell |
| 19 | `jupyter_resolve_comment` with that `threadId` | `status: "resolved"`, history preserved | Thread shows resolved in the panel |
| 20 | `jupyter_reopen_comment` with that `threadId` | `status: "open"` | Thread shows open again; then reply/resolve/reopen it back to resolved and leave it clean, or delete the thread by hand |
| 21 | `jupyter_export_notebook` `{"notebookPath": "customer-analysis.ipynb", "includeOutputs": false}` | Markdown `document` with `# Customer growth scratchpad` and fenced python blocks, no `data:image/` payloads | None |
| 22 | `jupyter_get_output_selection` `{}` with nothing selected | `null`. Then select text inside a rendered output by hand and call again: returns `{cellId, outputIndex, text, outputFingerprint}` | None (pure read) |

Also verify these error contracts: `jupyter_get_cells` with
`{"startIndex": -1}` → `INVALID_ARGUMENT` (never clamped);
`jupyter_update_cell` with no `source` → `INVALID_ARGUMENT` (never
silently empties the cell); `jupyter_run_cells` with an arbitrary source
string argument → rejected (there is no such argument; execution needs
visible cells).

## 3. Interaction flows

**F1 — STALE_CELL co-edit, human wins.** Read `working-filter` via
`jupyter_get_cells` (keep its `sourceHash`). By hand, edit that cell's
source and leave it unsaved. Call `jupyter_update_cell` with the old hash.
PASS if the call fails with `STALE_CELL` carrying `currentSourceHash` and
a preview, and your hand edit is byte-for-byte intact on screen. Re-read,
then write with the fresh hash only if you intend to keep the change;
otherwise restore the cell by hand.

**F2 — hidden cell invisibility.** By hand (cell context menu), set
`conversion-rate` to Hidden. Then: `jupyter_get_cells` with
`{"cellIds": ["conversion-rate"]}` → `CELL_NOT_FOUND` (indistinguishable
from a bad id); range reads omit it and report `hiddenCellCount: 1`;
`jupyter_get_context` with that cell active reports `activeCellId: null`
with `hiddenActiveCell: true` and no selected text; `jupyter_focus_cell`
on it → `CELL_NOT_FOUND`; selecting output inside its outputs (if any),
then `jupyter_get_output_selection` → `null`; comment threads anchored to
it disappear from `jupyter_list_comments` and `jupyter_get_comment` on
one → `CELL_NOT_FOUND`-family refusal. Click the cell by hand throughout:
you can still see and edit everything (owner lockdown never restricts the
human). Set it back to Editable afterward. PASS only if every surface
agrees and the human was never locked out.

**F3 — hidden notebook invisibility.** By hand, set
`codex-scratch.ipynb` to Hidden (file-browser menu or Access tab). Then:
`jupyter_list_workspace` does not list it (and no count reveals it);
`jupyter_open_notebook` on its path → `NOTEBOOK_NOT_FOUND`, identical to
a missing file; `jupyter_get_context` with it as the current notebook
reads as no notebook open. Set it back afterward. PASS on the same terms
as F2.

**F4 — access-cycle UI.** In the Agent panel → Access tab: the notebook
dropdown reads `write`/`read`/`none` and applies immediately; the
apply-to-all-cells control sets every cell; each per-cell row jumps to
its cell on click and cycles on its toggle. Set a cell to Read only, then
`jupyter_update_cell`/`jupyter_run_cells` on it → `CELL_ACCESS_DENIED`
while reads still work. Restore everything to `write` afterward.

**F5 — run-cells real kernel output.** Run `load-data`, then
`working-filter`, then `conversion-rate` in order via `jupyter_run_cells`.
PASS if execution counts increment in the UI, the printed conversion rate
updates, and the tool's `outputSummary` matches what you see. Then run a
cell with an error (insert `1/0` in scratch, run it): PASS if the failure
is reported inline per-cell (`status: "error"`, `ename`/`evalue`) without
throwing, and the traceback is visible in the notebook.

**F6 — review thread round-trip.** By hand: select an expression in
`conversion-rate`, Add Comment ("is this denominator right?"). As the
agent: `jupyter_list_comments` shows it, `jupyter_get_comment` shows your
message, `jupyter_reply_comment` answers it, and the reply is visible in
the Comments tab next to your message. Reply once more by hand to prove
no agent is needed. Resolve and reopen from both sides. PASS if every
step is visible in the panel and nothing ever summons or notifies anyone
(the agent only sees the thread on its next invocation — WebMCP cannot
wake it).

**F7 — presence and provenance are visible without asking.** Everything in
this flow is checked by *looking at the notebook*, not by reading a tool
result. With `customer-analysis.ipynb` open and in view:

1. Call `jupyter_get_cells` on `funnel-def`. PASS if that cell briefly gains
   a ring/left-edge tint and the status bar reads something like
   `Agent · reading cell 3`.
2. Call `jupyter_update_cell` on a scratch cell. PASS if a small
   `Reading… / Applying… / Running… / Done` badge appears under the cell
   input, **and** a `±N changed` button appears beside it. Click that
   button: PASS if a popover opens headed "What the agent changed" showing a
   `+`/`-` line diff of exactly what you wrote.
3. Call `jupyter_run_cells` on `load-data`. PASS if a
   `Run by Browser agent · HH:MM:SS` line appears under that cell's output.
   Click it: a popover names the tool, the duration in ms, and offers
   **Open Activity panel**.
4. Force a failure (e.g. `jupyter_update_cell` with a stale hash). PASS if
   the badge settles to `Failed` and clicking it shows the structured error
   code and duration.
5. Open the Agent panel → **Activity** tab. PASS if every call you made in
   this section is listed with its tool name, target and timing.
6. Edit a cell **by hand**, then call `jupyter_get_cell_access` on it. PASS
   if its `history` records a `human` `edited` entry — i.e. the notebook
   distinguishes your edits from the agent's.

Report FAIL for any step where the tool call succeeded but nothing on screen
told the human it had happened.

## 4. Pass/fail report template

```text
Driver: <name/client/version>   Date: <YYYY-MM-DD>   URL: <deployed URL>
Setup: PASS / SETUP-BLOCKED (<reason>)

Per-tool (PASS/FAIL + one-line evidence each):
01 get_context:        PASS — ...
... (all 22; paste the exact call args you used)
Error contracts (PASS/FAIL): startIndex -1 / missing source / no-arbitrary-exec

Flows:
F1 STALE_CELL human-wins:      PASS/FAIL — ...
F2 hidden cell invisibility:   PASS/FAIL — ...
F3 hidden notebook invisibility: PASS/FAIL — ...
F4 access-cycle UI:            PASS/FAIL — ...
F5 real kernel output + inline error: PASS/FAIL — ...
F6 review round-trip:          PASS/FAIL — ...
F7 presence + provenance visible: PASS/FAIL — ...

Cleanup: customer-analysis.ipynb left unmodified / restored (dirty: true/false);
  codex-scratch.ipynb deleted by hand: yes/no; access levels all back to write: yes/no.

Verdict: PASS (all green) / FAIL (<list every failing item>)
Notes: <anything surprising, including UI text that differs from this protocol>
```

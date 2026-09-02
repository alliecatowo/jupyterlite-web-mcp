# Demo script

A shot-by-shot script for a public demo video, targeting **under
2 minutes 30 seconds**, built around the notebook fixture
`content/customer-analysis.ipynb` (backed by `content/data/customers.csv`).
It follows the golden interaction described in SPEC.md §32/§46/§62: the
human and a compatible browser agent working the *same* live notebook, then
(optionally) the same review threads.

Cell ids referenced below are the stable ids in
`content/customer-analysis.ipynb`: `funnel-def`, `working-filter`,
`conversion-rate`, `region-table`, `region-chart`.

Before recording, open the deployed JupyterLite site with
`customer-analysis.ipynb` closed, and have a WebMCP-compatible browser agent
available in the same tab.

## Timing table

| Scene | Content | Duration | Running total |
| --- | --- | --- | --- |
| A | Ordinary JupyterLite, no AI product visible | 0:20 | 0:20 |
| B | Open the notebook by asking | 0:15 | 0:35 |
| C | Human selects code, agent fixes and reruns it | 0:30 | 1:05 |
| D | Human edits a filter, agent adds a comparison cell | 0:35 | 1:40 |
| E | Agent points back to code via focus | 0:15 | 1:55 |
| F (optional) | Review: comments, agent replies/investigates/reviews | 0:30 | 2:25 |

Total: **2:25** with Scene F, **1:55** without it. Both are within the
~2-2.5 minute target; cut Scene F first if time is tight.

## Scene A — ordinary JupyterLite (0:00-0:20)

1. Open the public deployment with no notebook open.
2. Say, to camera or in a caption:
   > "This is ordinary JupyterLite. The notebook, files, and Python kernel
   > run in the browser."
3. Open any notebook manually (mouse/keyboard, not the agent) and click
   **Run** on one cell.
4. **Visible result:** the cell executes normally, output appears, no chat
   panel or AI UI is present anywhere on the page.

## Scene B — open the notebook by asking (0:20-0:35)

1. Ask the browser agent:
   > "Open the customer analysis notebook."
2. **Expected tool calls:**
   - `jupyter_list_workspace` (finds `customer-analysis.ipynb`)
   - `jupyter_open_notebook` (`path: "customer-analysis.ipynb"`)
3. **Visible result:** the notebook visibly opens and comes to the front of
   the JupyterLab UI.

## Scene C — human points through native UI (0:35-1:05)

1. Click into the `conversion-rate` cell.
2. With the mouse, select only the substring `converted / visitors` inside
   `conversion_rate = converted / visitors`.
3. Ask:
   > "This looks wrong. Fix just what I selected and rerun it."
4. **Expected tool calls:**
   - `jupyter_get_context` (reads the exact selection: `converted / visitors`)
   - `jupyter_get_cells` (reads `conversion-rate`'s current source and hash)
   - `jupyter_update_cell` (replaces `converted / visitors` with
     `converted / eligible_sessions`, using the hash from the previous read)
   - `jupyter_run_cells` (`cellIds: ["conversion-rate"]`)
5. **Visible result:** the source visibly changes to use
   `eligible_sessions` (defined earlier in `funnel-def`) instead of
   `visitors`; the execution count increments; the printed conversion rate
   changes.

## Scene D — human modifies state (1:05-1:40)

1. Manually edit the `working-filter` cell to:
   ```python
   working = df[
       (df["plan"] != "free") &
       (df["region"] == "West")
   ].copy()
   ```
2. Run it manually (Shift+Enter), so the notebook — and every cell that
   depends on `working` — is now in a state the agent has not seen yet.
3. Ask:
   > "Keep my filter. Add a comparison to the overall paid-customer
   > baseline underneath the chart."
4. **Expected tool calls:**
   - `jupyter_get_context` / `jupyter_get_cells` (rereads the *live* notebook,
     including the human's just-run edit to `working-filter`)
   - `jupyter_insert_cell` (`referenceCellId: "region-chart"`,
     `position: "below"`, a new cell computing the overall paid-customer
     baseline for comparison, e.g. `df[df["plan"] != "free"]` metrics)
   - `jupyter_run_cells` on the newly inserted cell
5. **Visible result:** the West-region filter the human typed is still
   exactly there — untouched — and a new, visible cell appears below the
   chart with the baseline comparison, already executed.

## Scene E — agent points back (1:40-1:55)

1. Ask:
   > "Where is churn actually calculated?"
2. **Expected tool call:**
   - `jupyter_focus_cell` (`cellId: "region-table"` or wherever
     `churned` is aggregated, with a `selection` over the relevant
     `churn_rate=("churned", "mean")` expression)
3. **Visible result:** the notebook scrolls to and highlights the exact
   expression — the human immediately sees the referent with no further
   searching.

## Scene F — review sequence (optional, 1:55-2:25)

1. With the table and chart already visible, the human right-clicks the
   `region-table` output and chooses **Comment on Output**, entering:
   > "Why is this row such an outlier?"
2. The human selects `converted / eligible_sessions` in `conversion-rate`
   again (or another expression) and chooses **Add Comment**, entering:
   > "Are we sure this denominator is right?"
3. Ask the agent:
   > "Can you go through my unresolved notebook comments?"
4. **Expected tool calls:**
   - `jupyter_list_comments` (`status: "open"`)
   - `jupyter_get_comment` for each thread
   - For the denominator thread: `jupyter_reply_comment` answering directly
     from the visible code (no new cell needed).
   - For the outlier thread: `jupyter_insert_cell` with an investigation
     cell such as `df[df["customer_id"] == "C042"]`, `jupyter_run_cells`,
     then `jupyter_reply_comment` describing what the investigation cell
     showed.
5. Ask:
   > "Also review the rest without changing anything. Leave comments where
   > something looks suspicious."
6. **Expected tool calls:** `jupyter_get_cells` (read-only), then two or
   three `jupyter_create_comment` calls — no `jupyter_update_cell` or
   `jupyter_run_cells` at all in this step.
7. The human clicks one of the agent's new comments in the Review panel.
8. **Expected tool call:** none — this is the human navigating the Review
   panel directly, an ordinary notebook interaction.
9. **Visible result:** the notebook scrolls to the commented cell/output;
   the human types a reply ("This one is intentional.") directly in the
   panel with no agent involvement, demonstrating that replying to a
   comment is a normal, agent-optional action.

## If something goes wrong

- **Agent doesn't see the human's manual edit in Scene D:** confirm the
  agent's `jupyter_get_cells`/`jupyter_get_context` call happens *after*
  the manual edit was run, not before — the live model only reflects state
  as of the moment each tool is called.
- **`jupyter_update_cell` returns `STALE_CELL`:** re-run the read
  (`jupyter_get_cells` or `jupyter_get_context`) to pick up the current
  hash before retrying the update; this is the concurrency guard working as
  intended, not a bug — pause and explain it if it happens on camera.
- **`jupyter_run_cells` returns `KERNEL_UNAVAILABLE`:** the kernel hasn't
  finished starting yet; wait for the status bar to show an idle kernel
  before Scene B.
- **Status bar shows "WebMCP unavailable":** the browser/agent in use does
  not expose `document.modelContext`; switch to a WebMCP-compatible
  browser/agent before recording — the rest of the notebook still works
  normally in the meantime, which is itself worth calling out on camera.
- **A comment thread shows as orphaned in Scene F:** this means the
  anchored text was edited elsewhere and could not be matched unambiguously
  — expected, correct behavior (see `docs/review-comments.md`), not a
  failure; pick a different, untouched selection for the demo comment if
  it happens before recording.

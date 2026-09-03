# Demo script

A spoken walkthrough for a public demo video, built around the notebook
fixture `content/customer-analysis.ipynb` (backed by
`content/data/customers.csv`). It follows the golden interaction described
in SPEC.md §32/§46/§62: the human and a compatible browser agent working
the *same* live notebook, then the same review threads, then the owner's
access controls.

Cell ids referenced below are the stable ids in
`content/customer-analysis.ipynb`: `funnel-def`, `working-filter`,
`conversion-rate`, `region-table`, `region-chart`.

Before recording, open the deployed JupyterLite site
(`https://jupyterlite-web-mcp.vercel.app/lab/index.html`) with
`customer-analysis.ipynb` closed, and have a WebMCP-compatible browser
agent available in the same tab. Each step below says what you **DO**
(hands) and what you **SAY** (voiceover or caption).

## Timing table

| Scene | Content | Duration | Running total |
| --- | --- | --- | --- |
| A | Ordinary JupyterLite, no AI product visible | 0:20 | 0:20 |
| B | Open the notebook by asking | 0:15 | 0:35 |
| C | Human selects code, agent fixes and reruns it | 0:30 | 1:05 |
| D | Human edits a filter, agent adds a comparison cell | 0:35 | 1:40 |
| E | Agent points back to code via focus | 0:15 | 1:55 |
| F | Review: comments, agent replies/investigates/reviews | 0:35 | 2:30 |
| G | Access control: the owner decides what the agent may touch | 0:30 | 3:00 |

Total: **3:00**. Cut Scene F first if time is tight (lands at 2:25
without it); never cut Scene G — the access story is the point.

## Scene A — ordinary JupyterLite (0:00–0:20)

1. **DO:** Open the public deployment with no notebook open. Click a
   notebook, click **Run** on one cell.
   **SAY:** "This is ordinary JupyterLite. The notebook, the files, and
   the Python kernel run in the browser. There is no chat panel, no model
   picker, no AI product anywhere on this page — and everything I am about
   to show you works exactly the same with no agent connected."

## Scene B — open the notebook by asking (0:20–0:35)

2. **DO:** Ask the browser agent: "Open the customer analysis notebook."
   **SAY:** "The agent lists the workspace and opens the notebook — the
   same notebook I would open by clicking it."
3. **DO:** Show the notebook visibly opening and coming to the front.
   **SAY:** "It visibly opens. There is no shadow copy: the agent reads
   and writes the live model I am looking at, unsaved edits included."

## Scene C — human points through native UI (0:35–1:05)

4. **DO:** Click into the `conversion-rate` cell. With the mouse, select
   only the substring `converted / visitors` inside
   `conversion_rate = converted / visitors`.
   **SAY:** "I point with my own cursor — I select exactly the expression
   that looks wrong."
5. **DO:** Ask: "This looks wrong. Fix just what I selected and rerun it."
   **SAY:** "The agent reads my exact selection, reads the cell's current
   source and hash, replaces just my selection with
   `converted / eligible_sessions`, and runs the cell as a separate,
   explicit step."
6. **DO:** Show the source changing, the execution count incrementing, the
   printed conversion rate changing.
   **SAY:** "Source, execution count, output — all in the notebook I am
   already holding. And the honesty beat: the agent cannot run an arbitrary
   string of code. To compute something new it must insert a visible cell
   and run it, the same way I would."

## Scene D — human modifies state, human wins (1:05–1:40)

7. **DO:** Manually edit the `working-filter` cell to:
   ```python
   working = df[
       (df["plan"] != "free") &
       (df["region"] == "West")
   ].copy()
   ```
   Run it manually with Shift+Enter.
   **SAY:** "I change the filter by hand and run it. The notebook is now
   in a state the agent has never seen."
8. **DO:** Ask: "Keep my filter. Add a comparison to the overall
   paid-customer baseline underneath the chart."
   **SAY:** "The agent rereads the live notebook — including my just-run
   edit — inserts a visible baseline cell below the chart, and runs it."
9. **DO:** Show the West filter untouched and the new executed cell below
   the chart.
   **SAY:** "My filter is exactly where I left it. And if the agent had
   tried to write with a stale hash, the write would have been refused
   with a STALE_CELL error instead of overwriting me. If that happens on
   camera: that is the concurrency guard working, not a bug — the agent
   rereads and reconciles."

## Scene E — agent points back (1:40–1:55)

10. **DO:** Ask: "Where is churn actually calculated?"
    **SAY:** "Now the pointing goes the other way."
11. **DO:** Show the notebook scrolling to and highlighting the exact
    `churn_rate=("churned", "mean")` expression.
    **SAY:** "The agent focuses the cell and selects the expression with
    the notebook's own editor selection. I see the referent immediately —
    pointing is bidirectional."

## Scene F — review sequence (1:55–2:30)

12. **DO:** Right-click the `region-table` output, choose **Comment on
    Output**, enter: "Why is this row such an outlier?"
    **SAY:** "Review is an ordinary notebook feature, not an AI feature.
    I comment on the output by hand — and here is the second honesty
    beat: leaving this comment calls nobody. It changes the state the
    agent will see the next time I invoke it, because WebMCP cannot wake,
    summon, or notify an agent."
13. **DO:** Select `converted / eligible_sessions` in `conversion-rate`,
    choose **Add Comment**, enter: "Are we sure this denominator is
    right?"
    **SAY:** "One comment on code, one on output — both stored in the
    notebook's own metadata, traveling with the downloaded file."
14. **DO:** Ask: "Go through my unresolved comments. Don't change my
    existing cells."
    **SAY:** "The agent lists the threads, answers the denominator from
    the visible code, and — for the outlier — inserts a visible
    investigation cell, runs it, and replies with what it showed. The
    notebook records how the conclusion was reached."
15. **DO:** Ask: "Also review the rest without changing anything."
    **SAY:** "Read-only review: new threads appear in the same panel I
    use. I click one, the notebook scrolls to it, and I reply by hand —
    no agent involved."

## Scene G — access control: the owner's lockdown (2:30–3:00)

16. **DO:** Right-click the `conversion-rate` cell, cycle its agent access
    to read-only. Ask the agent to edit it.
    **SAY:** "I own what the agent may touch. This cell is now read-only
    for the agent — it can read it, but the edit is refused."
17. **DO:** Show the refusal. Then set the cell to hidden and ask the
    agent to read it.
    **SAY:** "Hidden is stronger: the cell is now indistinguishable from
    a cell that does not exist — same error, same silence, and every
    listing, focus report, export, and comment thread says so honestly
    instead of leaving a gap. And the third honesty beat: this lockdown
    never restricts me. There are no consent prompts anywhere — owner-side
    lockdown is the page's job; allow-once UX belongs to the browser."
18. **DO:** Set the cell back to editable from the Agent panel's Access
    tab.
    **SAY:** "One dropdown, human-only, no tool can change it. The demo
    itself is honestly single-user: real-time collaboration was verified
    behind a real server, but static hosting has no signaling and no
    maintained provider — so we document that instead of faking it."

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
- **Agent says a hidden cell "does not exist" in Scene G:** that is the
  access control working as intended — say so on camera, then reveal the
  cell yourself from the Access tab to prove you were never locked out.

# Agent collaboration roadmap

## Purpose

JupyterLite WebMCP already proves the essential interaction: a browser agent
can inspect the *live* notebook, including unsaved source, kernel state,
outputs, focus, and a human's exact text selection. It can make visible,
hash-guarded edits, run existing cells, and leave persistent review comments.

The next product step is to make that interaction feel collaborative rather
than transactional. A human should always be able to answer four questions:

1. What is the agent looking at now?
2. What has it done, what is it doing, and what happened?
3. What may it change without asking me again?
4. How can I ask it about this cell, selection, result, or failure?

This document is a proposal, not a claim that all features below have been
implemented.

## Observed baseline

The current project has a strong foundation:

- `jupyter_get_context` returns active cell, selected cells, cursor, and a
  bounded exact text selection. This is sufficient for a human to point at
  code naturally.
- It currently reports **editor source selections**, not a text range the
  person highlights inside rendered output. Output selections need their own
  deliberately scoped capability; browser-wide `window.getSelection()` alone
  is too ambiguous and can capture unrelated Jupyter chrome.
- Cell writes use source hashes, so an unsaved human edit rejects a stale
  agent mutation instead of being overwritten.
- Review threads can anchor to a cell, an exact source range, or an output.
- The local working tree includes a cell access/provenance layer
  (`write`/`read`/`none`) and an Activity panel with recent-action markers.
- The current Vercel deployment exposes 19 tools. The local working tree
  defines an additional `jupyter_get_cell_access` tool, so deployment and
  browser-test expectations must be brought into sync before that capability
  can be relied upon in production.

The live end-to-end smoke matrix exercised every deployed tool, including
cell insertion, updates, stale-write rejection, execution, successful and
failing runs, comments, resolution, deletion, saving, and kernel actions.

## Important platform boundary: WebMCP does not wake an agent

WebMCP lets an agent call page-defined tools. It does **not** define a way for
a page to summon, notify, interrupt, or stream an event to an agent. Selecting
text, changing a cell, running a cell, and replying to a comment therefore do
not automatically create an agent turn.

This is a useful privacy and control boundary. The page must not silently turn
ordinary notebook activity into agent traffic. The right interaction is an
explicit human handoff:

- an **Ask about selection** command/button that tells the host agent to call
  `jupyter_get_context`;
- an **Investigate this result** action on an output;
- a **Review changed cells** action that tells the host agent to read a known
  range; or
- a normal chat message such as “review the selected expression.”

The button can be excellent product UX, but it is host/application integration
outside WebMCP itself. It should visibly state what context will be shared and
never pretend to be an automatic wake-up.

### Output-selection handoff

Rendered output is often the real object of discussion: a surprising value in
a table, a traceback line, or text displayed beside a chart. Add an explicit
**Ask about selected output** interaction and a narrowly defined context
record:

```ts
interface IOutputSelection {
  cellId: string;
  outputIndex: number;
  text: string;                 // bounded plain-text selection
  range?: { start: number; end: number };
  outputFingerprint: string;    // detects replacement after selection
}
```

When a non-empty browser selection is wholly inside one notebook output
wrapper, the UI records that record. It should return `null` if the range
crosses cells, includes notebook chrome, lies in a rich widget that cannot be
represented safely as text, or exceeds the text bound. The next explicit
handoff then includes the output selection in `jupyter_get_context`, or a
separate `jupyter_get_output_selection` read-only tool can expose it. The
agent can anchor a review comment to the corresponding output only after
checking that its fingerprint still matches.

This design keeps selection meaning precise, avoids sending arbitrary page
text, and naturally extends to a visible “Investigate selected result” action.

## Product principles

1. **Visible first.** Agent code, edits, execution, and results are ordinary
   notebook state the human can inspect and undo.
2. **Least authority.** Read, propose, apply, run, save, delete, and restart
   are independent permissions; “can edit” must not imply “can delete.”
3. **Intent is inspectable.** Batch actions report their target set before
   they mutate it. A broad selector must never hide a surprising expansion.
4. **Concurrency is explicit.** Source hashes and notebook revisions remain
   mandatory for destructive/batch edits.
5. **No arbitrary hidden execution.** New code should be inserted visibly,
   then executed as a separate, attributable action.
6. **Graceful degradation.** Review, access controls, activity, and human
   commands remain useful when `document.modelContext` is unavailable.

## Batch cell operations

Single-cell tools are a safe base, but analytics work naturally operates on
sequences: run preparation cells, clear generated output, or make the same
small edit across selected cells. Do not make one oversized “do anything in a
notebook” tool. Add narrow batch primitives with uniform selectors, previews,
and result records.

### Shared selector

Use one `CellSelector` shape across batch tools:

```ts
type CellSelector =
  | { cellIds: string[] }
  | { startIndex: number; endIndex: number; includeTypes?: ('code' | 'markdown' | 'raw')[] }
  | { scope: 'active-cell' | 'selected-cells' | 'all-code-cells' };
```

Every selector response should echo resolved stable IDs, indexes, cell types,
and skipped/hidden cells. `all-code-cells` must be an explicit high-impact
scope, not a default.

### Proposed tools

| Tool | Purpose | Safety requirements |
| --- | --- | --- |
| `jupyter_preview_batch` | Resolve a selector and show target summaries without mutation. | Required first step for broad selectors; returns a preview token. |
| `jupyter_insert_cells` | Insert multiple visible cells relative to a reference or sequence. | Each requested cell has a type/source; return IDs in final order. |
| `jupyter_update_cells` | Apply replacements to multiple existing cells. | Every item supplies `cellId` and `expectedSourceHash`; atomic by default, optional best-effort mode explicitly requested. |
| `jupyter_delete_cells` | Remove a selected group of cells. | Preview token, exact hashes, a destructive permission, and per-cell result records. |
| `jupyter_run_cells` expansion | Run a selector/range, not just IDs. | Show resolved order; keep `stopOnError`; report a result for each cell. |
| `jupyter_clear_outputs` | Clear rendered outputs without deleting source. | Separate permission from edit/delete; preview selected output count. |
| `jupyter_move_cells` | Move a group above/below a reference cell. | Reject overlapping/malformed moves; preserve stable IDs and provenance. |

For a first release, use `cellIds` and contiguous `startIndex`/`endIndex` only.
Add tag/query-based selection later; it is easy to create unexpected scope and
requires a clear notebook metadata story.

### Transaction semantics

- `preview` returns a short-lived, notebook-revision-bound token.
- `apply` fails if the notebook revision or any expected source hash changed.
- Atomic is the default for updates/deletes/moves: no partial mutation when a
  human changed one target.
- Best effort is allowed only with an explicit `mode: 'best-effort'`; its
  result distinguishes applied, skipped, stale, access-denied, and failed.
- Every mutation emits a single batch activity event plus child cell records.
- A batch stores enough before-state to offer an immediate, human-visible
  **Undo last agent batch** command. Undo also respects later human edits and
  refuses rather than clobbering them.

## Permission and approval model

The existing per-cell `write`/`read`/`none` model is the correct granular
foundation. Add a notebook-scoped policy that decides *how* allowed actions
are applied, without bypassing cell-level restrictions.

```ts
type ApprovalMode =
  | 'ask-every-change'
  | 'preview-and-apply'
  | 'auto-apply-safe-edits'
  | 'auto-apply-within-scope';
```

Suggested meanings:

- **Ask every change:** agent may inspect and prepare a patch, but a person
  approves each apply/run/save/delete action.
- **Preview and apply:** agent may make a visible proposal; a single explicit
  Apply button commits the entire reviewed patch.
- **Auto-apply safe edits:** allow source updates only in `write` cells, with
  source hashes, no execution, no save, no deletion, and an activity trail.
- **Auto-apply within scope:** a time-limited, user-selected scope such as
  selected cells or a notebook section. It may optionally include execution
  of already-visible code, but never kernel restart, workspace file deletion,
  credential use, or external network access without another prompt.

Policy should show as a plain-language badge in the notebook chrome: for
example, “Agent: preview edits; ask before run.” A user can change it through
an ordinary Jupyter command or panel even when no agent is connected. Store
only durable user policy in notebook/workspace metadata; keep one-turn grants
and preview tokens in memory.

## Presence and visual feedback

The local Activity panel and decaying cell markers are a good start. Promote
them into a complete interaction language:

- A small **agent cursor/halo** on the currently targeted cell.
- Cell-level states: Reading, Planning, Draft ready, Applying, Running,
  Succeeded, Failed, and Waiting for approval.
- An activity timeline with tool name, concise intent, elapsed time, outcome,
  and a click-to-reveal target.
- A before/after diff block for each source update, not merely a success toast.
- A batch progress group that shows `3/8 cells run`, failed cells, and a
  one-click focus action.
- Output provenance: “generated by run 14:32 via agent” near result output,
  with a link to the activity event.
- An output-selection affordance: when the human highlights text inside a
  rendered result, show a small **Ask about this output** control that names
  the cell/output target before it hands context to the host agent.
- A persistent but quiet status badge showing both availability and policy:
  `WebMCP · 20 tools · Preview edits`.

Do not fake real-time thought. “Planning” should mean a tool invocation is in
flight, not imply that the page can observe an agent's private reasoning.

## Debugging and notebook-inspection tools

The current model deliberately prevents an agent from running arbitrary hidden
source. Keep that guardrail. Debugging should make existing notebook state
more legible, and any new code should still be inserted visibly before run.

Prioritized additions:

1. **`jupyter_get_execution_state`** — kernel status, queued/running cells,
   execution counters, elapsed time, and a bounded recent error summary.
2. **`jupyter_get_cell_diagnostics`** — parse/syntax diagnostics, undefined
   name hints where a lightweight analyzer is available, and bounded traceback
   context for a selected cell/range. It must not claim static inference is a
   runtime guarantee.
3. **`jupyter_get_dependency_graph`** — best-effort static reads/writes and
   execution-order hazards for Python notebooks. Return confidence and mark
   dynamic constructs as unknown.
4. **`jupyter_list_kernel_variables`** / **`jupyter_inspect_variable`** —
   opt-in, bounded variable metadata and safe previews (type, shape, columns,
   length, small head). This needs a clear sensitive-data policy and must
   avoid dumping full DataFrames, tokens, or arbitrary object reprs.
5. **`jupyter_get_run_history`** — bounded, per-cell execution outcome history
   with timestamps and environment/reset boundaries.
6. **`jupyter_export_artifact`** — explicit export of a selected plot/table to
   a visible workspace file, with a preview of destination and overwrite
   policy.

A free-form REPL tool is not the first recommendation. It weakens the key
invariant that humans see executable source before it runs. A better flow is:
`insert visible scratch cell → preview/approve if required → run it → inspect
bounded output → optionally keep, convert to a comment, or delete`.

## Contract hardening

The live test showed that `jupyter_get_cells({ startIndex: -1 })` was clamped
to zero even though the advertised JSON schema declares `minimum: 0`. Browser
and host implementations should not be assumed to enforce every schema
constraint. Tool handlers should defensively validate numeric ranges, enum
values, empty arrays, byte limits, and object shape, returning a structured
`INVALID_ARGUMENT` error. If clamping is intentional, remove the contradictory
schema restriction and document it explicitly.

The release checklist should also include:

- deploy the current 20-tool build before advertising access control;
- update browser integration tests from 19 to 20 tools and assert the access
  plugin activates;
- keep docs, status-bar count, schemas, and shipped artifacts in lockstep;
- exercise both the native WebMCP implementation and the test shim; and
- test batch behavior under stale source, denied access, hidden cells, failed
  execution, notebook reload, and kernel restart.

## Suggested delivery order

1. **Ship parity and hardening:** deploy current access/activity work, repair
   19/20 expectations, and add handler-side validation.
2. **Make actions legible:** active/in-flight presence, durable activity
   timeline, diffs, and clear status/policy badges.
3. **Add approval modes:** start with `ask-every-change` and
   `preview-and-apply`; preserve existing source-hash protections.
4. **Add batch primitives:** preview + atomic multi-update/run first;
   deletion/move/clear-output after undo and policy UX are proven.
5. **Add debugging/inspection:** execution state and diagnostics first,
   dependency graph next, variable inspection only with strong bounds and
   privacy decisions.
6. **Integrate a deliberate host handoff:** “Ask about selection” and
   “Investigate output,” clearly documented as host integration rather than a
   WebMCP wake-up capability.

## Acceptance criteria

A feature is ready when a user can see its target, permission, preview,
progress, outcome, and undo/recovery path without reading agent logs. Tests
should prove that a stale human edit prevents batch overwrite; `none` cells
remain undisclosed; broad selectors are previewed; denied actions leave no
partial state; failed runs produce useful bounded diagnostics; and agent
activity never claims a page autonomously woke it.

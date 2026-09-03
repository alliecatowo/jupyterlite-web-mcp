# Propose/Deny mode

Direct mode is the extension's original and default behavior: a mutating
tool call — `jupyter_update_cell`, `jupyter_insert_cell`,
`jupyter_delete_cell`, `jupyter_run_cells`, and so on — applies immediately,
subject to the existing `sourceHash`/`STALE_CELL` guard and per-cell
access control. README used to describe the missing alternative this way:

> There is no propose/suggest mode. Agent access is `write`, `read` or
> `none`. A write call on a `read` cell is refused with
> `CELL_ACCESS_DENIED` — it does not degrade into a pending suggestion. The
> natural fourth level is a `propose` access where a write lands as a
> staged edit the human accepts or rejects; the diff rendering it would
> need already exists (that is the `±N changed` popover), but the staging
> semantics — what `sourceHash` a proposal returns under the read-hash-write
> contract, how a proposed insert or delete is represented, what every read
> tool reports about a pending proposal — are real design work.

This document is that design, now built for `jupyter_update_cell`.

## Scope: `jupyter_update_cell` only

Propose mode currently covers **`jupyter_update_cell`** — an edit to an
existing, visible cell's source, which is the one mutating tool where "the
change" is a single before/after pair a human can review as a diff. It
does not (yet) cover `jupyter_insert_cell`, `jupyter_delete_cell`, or
`jupyter_run_cells`, which still apply immediately in both Direct and
Propose mode. Extending the same state machine to those is real, separate
design work — an insert/delete proposal needs a different diff
representation than a source replacement, and a "propose to run this cell"
UX raises its own questions about what a pending-but-not-yet-run cell
should show. Shipping a real, fully-tested slice for one tool was chosen
over a shallow pass across all of them.

## The mode toggle

`ProposeStore` (`src/propose/store.ts`) holds a single `mode`:
`'direct'` (default) or `'propose'`. It is human-only, exactly like
per-cell agent access (`src/access/guard.ts`): no WebMCP tool can read or
change it. It is set from:

- the **Direct mode / Propose mode** button in the Agent panel's header
  (`src/ui/panel.tsx`), or
- the `jupyterlite-webmcp:toggle-propose-mode` /
  `jupyterlite-webmcp:set-propose-mode` commands
  (`src/propose/commands.ts`), reachable from the command palette.

The mode is a single global setting for the session (not per-notebook or
per-cell): the human decides how much they want to review right now, the
same way they would decide whether to accept every autocomplete suggestion
or read every one first.

## What changes in Propose mode

`jupyter_update_cell`'s handler (`src/webmcp/tools.ts`) branches once, on
`propose.mode`:

- **Direct mode** — calls `updateCell` (`src/jupyter/cells.ts`) exactly as
  before. Nothing about this path changed.
- **Propose mode** — calls `proposeUpdateCell` (`src/propose/tools.ts`)
  instead.

`proposeUpdateCell`:

1. Resolves the notebook and validates the write — the same access check
   and `sourceHash` freshness check Direct mode's `updateCell` runs
   (extracted into `resolveWritableCell`, shared by both) — **before**
   creating a proposal. A write that could never succeed (bad cell id, a
   `read`-only cell, a stale hash) fails immediately with the usual
   structured error, rather than first showing the human a proposal that
   could never be accepted.
2. Creates a pending proposal in `ProposeStore`: the cell's current source
   (`before`), the proposed replacement (`after`), and the `sourceHash` the
   write was predicated on.
3. **Waits.** The tool call's Promise — the WebMCP `execute()` return —
   does not resolve until the human accepts or denies the proposal, or the
   call is aborted. This is a genuine, long-lived pending state: nothing
   about the extension "polls" or "drives" the decision. Waiting is
   implemented as a plain `Promise` that `ProposeStore.accept`/`.deny`
   settle from the UI thread.
4. **Accept** re-validates the `sourceHash` (see "Re-validation on accept"
   below) and calls `updateCell` — the *exact same function* Direct mode
   calls. There is exactly one code path that ever writes a cell's source;
   Propose mode adds a wait in front of it, not a second way to apply a
   change.
5. **Deny** resolves the tool call with a normal, **non-error** result:
   ```ts
   { status: 'denied', code: 'PROPOSAL_DENIED', proposalId, cellId,
     reason: string | null }
   ```
   `isError` is not set. A human saying no is an expected outcome the
   agent's next turn should read and adjust to, not a failure to recover
   from — so it does not go through the `ErrorCode` channel that
   `STALE_CELL`/`CELL_ACCESS_DENIED`/etc. use. `reason` is whatever the
   human typed into the inline deny control (optional; `null` when left
   blank).

## The inline diff UI

`ProposalMarkers` (`src/propose/markers.ts`) renders a banner directly
under the targeted cell — not a floating popover — for every pending
proposal on the currently-open notebook: a header naming the tool, the
before/after diff (the same dependency-free LCS differ and
`.jp-webmcp-diffBlock`/`.jp-webmcp-diffLine-*` rendering the after-the-fact
`±N changed` popover already used, per README's own framing of what
already existed), an **Accept** button, a **Deny** button, and a text input
for the deny reason.

It is deliberately not built on the existing `Popover` primitive
(`src/ui/popover.ts`): that primitive closes itself on an outside click,
Escape, or its anchor scrolling out of view — exactly wrong for a control
whose entire point is that it must not vanish by accident before the human
actually decides. The banner instead stays up until `ProposeStore` reports
the proposal is no longer pending (accepted, denied, or aborted).

## One pending proposal per cell

`ProposeStore.propose` throws `ProposalAlreadyPendingError` synchronously
if the target cell already has a pending proposal; `proposeUpdateCell`
turns that into a real, thrown `PROPOSAL_ALREADY_PENDING` tool error
(carrying the existing proposal's id) rather than either queuing the new
one or silently replacing the old one.

**Why refuse rather than queue:** a queue means the diff shown to the
human is no longer necessarily the diff the agent is currently waiting on
— by the time proposal #1 is decided, the agent might have moved on, or
the notebook might have changed underneath proposal #2's assumptions. A
straightforward refusal keeps the invariant simple: at most one open
question per cell, so what the human sees in the notebook is always
exactly what one agent tool call is waiting on. An agent that wants to
propose a different change to the same cell can retry once it sees
`PROPOSAL_ALREADY_PENDING` (and, structurally, once the prior one settles,
the same cell is immediately free again).

## Re-validation on accept

The `sourceHash` a proposal is predicated on is checked **twice**: once
before the proposal is created (see above), and again inside `updateCell`
when the human accepts it. A proposal can sit pending for an arbitrary
amount of real time — the human might edit the cell by hand while
deciding. If they then click Accept, the second check catches this
exactly like any other stale write: the accept fails with the ordinary
`STALE_CELL` error (not a special propose-mode error), because "the human
always wins" (README) applies here precisely as it does in Direct mode.
This is exercised directly in
`tests/unit/propose-tools.spec.ts` ("re-checks the sourceHash on accept").

## `AbortSignal`

`proposeUpdateCell` accepts the same `options.signal` every tool handler
receives (`src/webmcp/types.ts`). If it fires while a proposal is pending,
`ProposeStore` marks the proposal `'aborted'`, removes it as the cell's
pending proposal (freeing the cell for a new one), and the tool call
rejects with the same `toolError('ABORTED', ...)` shape
`jupyter_run_cells` already produces for an aborted invocation — so an
agent runtime does not need a second abort-handling code path for Propose
mode. The banner disappears from the notebook as soon as this happens.

## What is *not* persisted

Unlike review threads (`src/review/storage.ts`), pending proposals are
**not** written into notebook metadata. A proposal is mid-flight tool-call
state, not a durable record: once accepted it becomes an ordinary cell
edit (with its own provenance history entry, exactly like a Direct-mode
write); once denied or aborted there is nothing left worth keeping.
Reloading the page cleanly drops any pending proposal, the same way it
would drop any other in-flight browser Promise.

## Testing

- `tests/unit/propose-store.spec.ts` — the state machine in isolation: mode
  toggling, create/accept/deny, the already-pending refusal, and abort
  handling (no JupyterLab dependency at all).
- `tests/unit/propose-tools.spec.ts` — `proposeUpdateCell` against a fake
  Jupyter environment: the full accept and deny round trips, the
  fail-fast stale-hash check before a proposal exists,
  `PROPOSAL_ALREADY_PENDING`, `AbortSignal` handling, and the
  re-validation-on-accept scenario above.
- `ui-tests/propose.spec.ts` — Playwright, against the real built
  extension: Direct mode is unaffected; Propose mode genuinely holds the
  tool call pending while rendering the inline diff; Accept applies through
  the same path Direct mode uses; Deny-with-reason resolves as a
  non-error result the agent can read; a second proposal on a pending cell
  is refused; and an aborted call cleanly cancels its proposal.

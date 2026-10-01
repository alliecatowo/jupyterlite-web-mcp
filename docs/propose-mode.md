# Propose / Deny mode

By default the agent works in **Direct mode**: a tool call that edits a cell
applies immediately, guarded by the `sourceHash` check so it can never
overwrite a change you made.

**Propose mode** adds a review step. Switch it on when you want to see every
edit before it lands.

## Turn it on

Use the **Direct mode / Propose mode** button in the Agent panel header, or the
`jupyterlite-webmcp:toggle-propose-mode` command from the command palette. It's
a human-only setting for the whole session; no agent tool can read or change it.

## What happens

When the agent calls `jupyter_update_cell` in Propose mode, nothing changes in
the notebook yet. Instead a banner appears directly under the target cell
showing the exact before/after diff, with **Accept** and **Deny** buttons and an
optional reason field.

- **Accept** applies the edit through the same code path Direct mode uses.
- **Deny** returns a normal result (not an error) with code `PROPOSAL_DENIED`
  and your reason, so the agent's next turn knows why and can adjust.

The agent's tool call genuinely waits until you decide. The banner stays up
until you do, or until the agent cancels the call.

## Rules worth knowing

- **Only `jupyter_update_cell` is covered today.** Insert, delete and run still
  apply directly in both modes. See the [roadmap](/roadmap).
- **One pending proposal per cell.** A second proposal on the same cell is
  refused with `PROPOSAL_ALREADY_PENDING`, so what you see is always exactly
  what one tool call is waiting on.
- **You still win conflicts.** If you edit the cell by hand while a proposal is
  pending, Accept fails with the usual `STALE_CELL` error and your edit stands.
- **Proposals aren't saved.** A pending proposal is an in-flight tool call, not
  document data. Reloading the page drops it.

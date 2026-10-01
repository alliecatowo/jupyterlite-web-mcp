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
  and your reason, so the agent's next turn knows why and can adjust. The
  reason is optional and capped at 2 KiB of UTF-8; a longer one is cut short,
  not rejected.

The agent's tool call genuinely waits until you decide. The banner stays up
until you do, until the agent cancels the call, or until the proposal can no
longer be reviewed (below).

## Auto-deny

The banner is the only place to decide a proposal, so a proposal that can no
longer be shown is denied for you, with the same non-error `PROPOSAL_DENIED`
result and a reason the agent can act on:

- the target cell was deleted;
- the notebook's last open view was closed;
- the notebook was renamed or moved (Accept applies at the original path, so
  it could never succeed).

Moving the cell keeps its id, so the proposal stays pending. Closing one of
several views of the same notebook also keeps it pending.

## Rules worth knowing

- **Only `jupyter_update_cell` is covered today.** Insert, delete and run still
  apply directly in both modes. See the [roadmap](/roadmap).
- **One pending proposal per cell.** A second proposal on the same cell is
  refused with `PROPOSAL_ALREADY_PENDING`, so what you see is always exactly
  what one tool call is waiting on.
- **Doomed edits fail before you see them.** The access check, the
  `sourceHash` check and the 256 KiB source-size check all run before the
  proposal is created, so an edit that could never apply is refused with the
  usual error instead of becoming a banner.
- **You still win conflicts.** If you edit the cell by hand while a proposal is
  pending, Accept fails with the usual `STALE_CELL` error and your edit stands.
- **Pending proposals are never dropped.** Only settled proposals are trimmed
  (the newest 20 are kept); a pending one stays until it is decided, aborted or
  auto-denied, however many there are.
- **Proposals aren't saved.** A pending proposal is an in-flight tool call, not
  document data. Reloading the page drops it.

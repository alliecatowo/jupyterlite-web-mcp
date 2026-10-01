# Security model

## What the extension does to stay safe

- **Notebook content is untrusted input.** Cell source, outputs and comment bodies can contain text written to look like instructions. Every tool that returns them sets `untrustedContentHint: true`.
- **No arbitrary execution.** Code runs only through `jupyter_run_cells`, on cells that visibly exist. There is no "run this string" tool and no hidden kernel introspection.
- **No silent overwrites.** `jupyter_update_cell` and `jupyter_delete_cell` need a `sourceHash` from a prior read. A stale write is refused with `STALE_CELL`.
- **No credential surface.** It never reads or exposes cookies, auth tokens, unrelated `localStorage`, or anything outside the notebook workspace.
- **Narrow selection capture.** An output selection is recorded only when it lies wholly inside one output. Selections crossing cells, touching notebook chrome, or including rich widgets are rejected.
- **Owner-side lockdown.** Access levels (`write`, `read`, `none`) are set by the human from menus or the Agent panel. No tool can read or change them, and hidden items are reported as *not found*.
- **Bounded results.** Every size cap lives in one place (`src/limits.ts`).

## What access levels do not guarantee

Access levels are a guardrail on the agent's *tools*, not a sandbox.

- **Code the agent runs isn't restricted by them.** An agent allowed to insert and run a cell can run Python, and that code can read whatever the kernel can reach, including the saved `.ipynb` (in JupyterLite the browser workspace is mounted in the kernel). If a notebook holds secrets, keep it `read`-only and don't let the agent run cells in it, or keep the secrets out of the workspace.
- **Metadata is editable.** Access levels live in notebook and cell metadata, so a collaborator or hand-edit can change them.
- **It fails open.** If an access level can't be read, it degrades to `write` rather than locking the workspace.
- **Hidden cells aren't invisible in aggregate.** Range reads report a `hiddenCellCount`; only lookups by id are indistinguishable from a missing cell.

## Permission prompts belong to the client

There are deliberately no allow-once or allow-always prompts in the page.
That permissioning UX belongs to the WebMCP client (the browser or agent), not
to the site.

## Reporting a vulnerability

Please use the repository's [private vulnerability reporting](https://github.com/alliecatowo/jupyterlite-web-mcp/security/advisories/new) and read [SECURITY.md](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/SECURITY.md) for supported versions.

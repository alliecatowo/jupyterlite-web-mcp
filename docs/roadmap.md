# Roadmap

This project is maintained by two people around jobs and life, so there are
**no dates here**, only an order of intent. Items move when someone has the time
to do them well, and the list changes as we learn what people actually use.
Nothing below is a promise; it is the direction.

Want something moved up? [Open a discussion](https://github.com/alliecatowo/jupyterlite-web-mcp/discussions)
or 👍 an existing [issue](https://github.com/alliecatowo/jupyterlite-web-mcp/issues). Real use cases outweigh
everything else.

## Shipped

- **0.1.0 on PyPI.** `pip install jupyterlite-webmcp` for JupyterLab, Notebook 7 and JupyterLite.
- 22 WebMCP tools across read, navigate, edit, execute and review.
- Per-cell and per-notebook access levels; Propose/Deny mode for `jupyter_update_cell`.
- Presence layer: rings, badges, inline diffs and output provenance.
- Review threads stored in notebook metadata, with re-anchoring across edits.
- Verified on JupyterLite, JupyterLab 4.6 and Notebook 7; browser tests on every PR.
- Automated releases (PyPI Trusted Publishing) and self-maintaining dependency updates.

## Now <span class="status now">in progress</span>

- **This docs site**, kept in step with the code.
- **Hardening the 0.x tool surface.** Collecting feedback on tool names, inputs and error codes so they can settle.
- **Real-world testing with more WebMCP clients** as browsers and agents add support, and documenting what works where.

## Next <span class="status next">most wanted</span>

- **Propose/Deny for insert and delete.** Extend reviewable changes beyond in-cell edits. Inserts have no "before" to diff, so this needs its own representation.
- **Propose/Deny for running cells.** A "propose to run" flow, including what a pending-but-unrun cell should look like.
- **Policy templates.** Per-notebook or team-wide defaults for what an agent may touch, instead of setting access cell by cell.
- **Agent in the collaboration layer.** Show the agent as a labelled participant (Yjs awareness) when several humans share a notebook through `jupyter-collaboration`.
- **Batch cell operations.** Narrow primitives (insert, update, delete, move, clear outputs) over a shared cell selector, with a preview step that shows exactly which cells a broad selector resolves to, per-cell source hashes, and separate permissions so "can edit" never implies "can delete". Starts with explicit cell ids and contiguous ranges; tag or query selectors come later because they make surprising scope too easy.
- **A 1.0 tool contract.** Freeze names, schemas and error codes, with a documented deprecation policy.

## Later <span class="status later">ideas</span>

- **Richer outputs.** Today images and other binary outputs are placeholders; give agents a safe, bounded way to reason about plots and tables.
- **More install paths**, such as conda-forge, and a drop-in template for JupyterLite sites.
- **Example notebooks and recipes** for teaching sites, data exploration and review workflows.
- **A proper project site** with its own domain.
- **Review workflows.** Assigning threads, summaries across a notebook, export of review state.

## Deliberately not planned

- **A built-in chat UI or LLM.** This is the tool surface, not an assistant. Bring your own agent.
- **A server-side component.** The point is that it works with no backend, including on static JupyterLite sites.
- **Hidden execution.** Anything the agent runs stays a visible cell.

## How to help

- **Try it and tell us** what you wished the agent could do.
- **Pick up an issue.** See [CONTRIBUTING.md](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/CONTRIBUTING.md).
- **Sponsor** the work through [GitHub Sponsors](https://github.com/sponsors/alliecatowo) if it's useful to you. It buys maintainer time.

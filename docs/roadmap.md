# Roadmap

JupyterLite WebMCP won the OpenAI WebMCP Challenge as a hackathon build. The
plan is to keep developing it here, in the open, as one project. The judged
version stays easy to find as the
[`webmcp-challenge-winner`](https://github.com/alliecatowo/jupyterlite-web-mcp/tree/webmcp-challenge-winner)
tag, and the project stays open source.

This project is maintained by two people around jobs and life, so there are
**no dates here**, only an order of intent. Items marked *(idea)* haven't been
designed yet. Nothing below is a promise; it is the direction.

Want something moved up? [Open a discussion](https://github.com/alliecatowo/jupyterlite-web-mcp/discussions)
or 👍 an existing [issue](https://github.com/alliecatowo/jupyterlite-web-mcp/issues). Real use cases outweigh
everything else.

## North star

A notebook that any agent on the web can open, use and share with a human,
with nothing to install.

WebMCP is useful because it's disposable. An agent visits a page, the page
hands it the tools it needs, and nothing is left installed afterwards. For
notebooks, that means an agent like ChatGPT can open a hosted notebook in its
browser and do real data work in it, while you watch, comment, accept, deny and
take over in the same tab. You don't install an MCP server and you don't copy
anything out of the browser.

## Shipped

- **0.1.0 on PyPI.** `pip install jupyterlite-webmcp` for JupyterLab, Notebook 7 and JupyterLite.
- 22 WebMCP tools across read, navigate, edit, execute and review.
- Per-cell and per-notebook access levels; Propose/Deny mode for `jupyter_update_cell`.
- Presence layer: rings, badges, inline diffs and output provenance.
- Review threads stored in notebook metadata, with re-anchoring across edits.
- Verified on JupyterLite, JupyterLab 4.6 and Notebook 7; browser tests on every PR.
- Automated releases (PyPI Trusted Publishing), self-maintaining dependency updates, and this docs site.

## Now: make the hackathon build solid

- **Tool audit.** Go through all 22 tools: which stay, which merge, which go. Tighten names, schemas and error envelopes against how real agents actually call them.
- **Deep visual revamp.** The UI works, but it still looks like a hackathon build. Rework the agent panel, the diff and review views, the presence display and the access-control UI so they read as one design.
- **Propose/Deny for every write.** Today it covers only `jupyter_update_cell`. Extend it to:
  - `jupyter_insert_cell` and `jupyter_delete_cell`, which need a diff representation with no "before" side.
  - `jupyter_run_cells`, with a "propose to run" step and a clear pending state.
- **Try a proposal before accepting it** *(idea)*. Run the proposed version of a cell in a sandbox, see the output, then accept or deny. Faster loop, same control.
- **Install and release hygiene.** Smooth PyPI releases and clear compatibility ranges.

## Next: richer notebooks for agents

- **Batch cell operations.** Narrow primitives (insert, update, delete, move, clear outputs) over a shared cell selector, with a preview step that shows exactly which cells a broad selector resolves to, per-cell source hashes, and separate permissions so "can edit" never implies "can delete". Starts with explicit cell ids and contiguous ranges.
- **Widgets (ipywidgets, sliders, interactive controls).** Cut from the demo. The goal: the agent reads widget state, sets widget values, and sees how you moved a slider and responds.
- **Rendered output for the agent** *(idea)*. An image of the whole rendered notebook or of selected cells, plus PDF export, so the agent can check the visual result and not just the source.
- **Plot styling helpers** *(idea)*. Consistent Seaborn and Matplotlib theme defaults, so the agent doesn't restyle every chart by hand.
- **More AI-native notebook features** *(idea)*. Intent notes on cells, review summaries, suggested next cells.
- **Policy templates.** Per-notebook or team-wide defaults for what an agent may touch, instead of setting access cell by cell.
- **A 1.0 tool contract.** Freeze names, schemas and error codes, with a documented deprecation policy.

## Multiplayer

- **The agent as a real participant in collaborative sessions.** Today, remote humans behind `jupyter-collaboration` see the agent's edits arrive, but with no labelled cursor. The fix is to put the agent into the Yjs awareness layer with honest presence: it shows up only while a call is actually in flight.
- **Several humans and several agents in one notebook.** Each with its own presence, access scope and review threads.

## Platforms

- **Full Jupyter, not just JupyterLite.** The same extension already runs unchanged on JupyterLab 4.6 and Notebook 7. Make that a tested, supported, documented path with CI coverage.
- **More install paths**, such as conda-forge, and a drop-in template for JupyterLite sites.

## Later: a hosted notebook any agent can use

- **A hosted JupyterLite WebMCP site.** Most people who need a notebook for one quick piece of analysis won't host their own. An agent visits the site, starts a notebook, does the work and hands you the link.
- **Persistence, private notebooks and team spaces.** For people who want it to just work without running anything themselves. The core stays open source and self-hostable.
- **A custom notebook front-end** *(idea, long-term)*. A notebook style built for human-agent work, possibly forked from JupyterLite, if the extension model turns out to be too limiting.

## Community

- Keep this one repo and develop it in public.
- Mark good first issues, keep contributor docs current, and write down design decisions as they're made.
- Feedback from people using it with agents decides what gets built first.

## Not planned

- **A built-in chat UI or a bundled model.** The agent is always whatever you already have.
- **A tool that executes arbitrary strings.** Every write goes through cell-level, access-controlled tools; anything the agent runs stays a visible cell.

## How to help

- **Try it and tell us** what you wished the agent could do.
- **Pick up an issue.** See [CONTRIBUTING.md](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/CONTRIBUTING.md).
- **Sponsor** the work through [GitHub Sponsors](https://github.com/sponsors/alliecatowo). It buys maintainer time.

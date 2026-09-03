# Multiplayer

## The short version

This extension writes to the notebook's shared model. In JupyterLab 4 that
shared model *is* a Yjs document, and a Yjs document is exactly what Jupyter's
own `jupyter-collaboration` server extension synchronizes between connected
people.

So when this extension is served behind `jupyter-collaboration`, an agent's
edits reach every other human in the session live, with no reload and no
integration code. Not because anything here was written for collaboration —
because the agent was never given a private copy to work in.

That was verified, not assumed. Two independent browser clients were pointed at
the same notebook on a real Jupyter Server with `jupyter-collaboration` 5.0.2
installed, the agent tools were driven in the first, and the second was
observed.

| What the agent did in client A | What client B saw |
| --- | --- |
| `jupyter_update_cell` | The new source, within about two seconds, no reload |
| `jupyter_insert_cell` | The new cell appear |
| `jupyter_run_cells` | The output and the execution count |
| `jupyter_create_comment` | The thread, both in its own metadata and in its Review panel |
| Set a cell to `none` access in B | The agent in A could no longer see that cell at all |

## The result that matters

The concurrency guard protects a *remote* human, not just the local one.

Read a cell's hash as the agent in client A. Have a human edit that same cell in
client B. Then have the agent try to write with the hash it read:

```json
{
  "error": "STALE_CELL",
  "message": "Cell changed since it was read.",
  "currentSourceHash": "…",
  "currentSourcePreview": "…the other person's text…"
}
```

The write is refused and the other person's text is untouched. The guard was
built to stop an agent clobbering the unsaved edit of the human sitting in front
of it; it turns out to stop it clobbering the unsaved edit of a human on another
machine, for the same reason and with no extra code.

## What this does not claim

**The live demo has none of this.** `jupyter-collaboration` is a *server*
extension, and the deployed demo is JupyterLite: there is no server, so there is
no real-time collaboration there at all. Everything above requires a real
Jupyter Server.

**The agent is not in the presence layer.** Shared cursors and the participant
list are carried on Yjs *awareness*, a separate channel from the document. This
extension writes to the document only, so other people see the agent's edits
arrive the way they would see edits from any other client — they do not see a
labelled "Browser agent" cursor. Putting the agent into the awareness layer is a
small, additive change and a plausible next step; it is deliberately not claimed
as done.

## Why this composes instead of conflicting

There is no integration surface to get wrong. `jupyter-collaboration` syncs the
shared model; this extension edits the shared model. Neither knows about the
other. The same is true of the review threads and the per-cell access levels,
because both live in notebook and cell metadata, which is carried in the same
Yjs document as the cell sources — verified by reading the second client's
metadata directly rather than through any tool.

That is the whole argument for operating on live application state instead of a
copy: the properties you did not build for come along anyway.

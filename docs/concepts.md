# Concepts

## The problem

A working notebook lives in a browser tab, and little of it exists on disk: the
cell you just typed, the text you highlighted, the DataFrame in kernel memory,
the chart that only rendered because you ran cells in a certain order.

Getting an AI to help with that usually means a copy. Paste into a chat window
and the model sees a dead snapshot. Bolt on a server-side MCP integration and
it reads `.ipynb` bytes from disk, a file that no longer matches your screen,
and it needs a Jupyter server you may not have. On JupyterLite there is no
server at all.

JupyterLite WebMCP skips the copy. It exposes the live notebook through
[WebMCP](https://github.com/webmachinelearning/webmcp)
(`document.modelContext.registerTool`), so the agent works on the same unsaved
edits, selection, kernel and outputs that you do.

## A second editor, not a scratch space

One question shaped every feature: *could this still make sense if the second
participant were a human instead of an agent?*

| A second human would… | …so the agent |
| --- | --- |
| never get a private copy | writes to the live shared model (a Yjs document, so it composes with `jupyter-collaboration`) |
| never silently overwrite your unsaved edit | must present the `sourceHash` it read; a stale write is refused with `STALE_CELL` |
| never run code you can't see | has no "execute this string" tool; to compute something it inserts a visible cell and runs it |
| leave comments in the document | writes review threads into the notebook's own metadata |
| be visible while working | gets presence rings, state badges, inline diffs and output provenance |
| point, and be pointed at | reads your exact selection and can scroll your notebook to an expression |
| respect what you marked off-limits | obeys per-cell and per-notebook access levels it can't read or change |

## What you see when the agent acts

- A calm ring around the targeted cell, colour-coded by read, write, run or focus. It never shifts layout and honors `prefers-reduced-motion`.
- An inline badge under the cell: `Reading…`, `Applying…`, `Running…`, `Done`, or `Failed` (click for the tool, error code and duration).
- A `±N changed` button on any cell the agent edited, opening a real before/after diff.
- `Run by Browser agent · 14:03:21` under outputs the agent produced.
- A status line that doesn't overclaim. A page can't tell whether an agent is present, so the idle text describes the page (`WebMCP ready`) and only mentions an agent when one demonstrably did something.

## What WebMCP can't do

A page can't wake, summon or notify an agent. Editing a cell or leaving a
comment changes the state an agent will see the next time you invoke it. The UI
says so out loud rather than pretending otherwise.

## Works without WebMCP

Turn WebMCP off and the notebook, Agent panel, review threads, presence markers
and access controls all still work. The extension only adds a tool surface; it
never gates a feature behind one.

## Where to go next

- [Tool reference](/webmcp-tools) for all 22 tools.
- [Security model](/security) for what access levels do and don't guarantee.
- [Architecture](/architecture) for how the plugins and adapters fit together.

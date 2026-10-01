# FAQ

## Which browsers and agents does this work with?

Any browser that exposes `document.modelContext` and any agent that can call
WebMCP tools. It has been verified on the live demo in Chrome with WebMCP
enabled, and the project was built for ChatGPT's in-app browser. As of writing
no browser ships WebMCP by default, so the extension detects its absence and
stays out of the way. The notebook works either way.

## Do I need a server, API keys or a chat UI?

No. It's a frontend extension with no server component, no keys and no LLM of
its own. Bring your own agent.

## Does it work in JupyterLab and Notebook 7, or only JupyterLite?

All three. It's one prebuilt extension, verified against a JupyterLite site
(Pyodide kernel), a JupyterLab 4.6 server and a Notebook 7 server, with no
platform-specific code. See [Install](/install).

## Can the agent run arbitrary code?

Only by inserting a visible cell and running it, which you can watch. There is
no hidden execution path. See the [security model](/security) for what that
does and doesn't protect against.

## What if I edit a cell while the agent is working?

The agent's write is refused with `STALE_CELL` and your text is untouched. The
human always wins.

## Can I require approval for each edit?

Yes: switch the Agent panel to [Propose mode](/propose-mode). It currently
covers `jupyter_update_cell`; insert, delete and run still apply directly (see
the [roadmap](/roadmap)).

## Does it work with real-time collaboration?

The agent writes to the same Yjs model that `jupyter-collaboration` syncs, so
remote humans see its edits arrive. The agent doesn't yet appear in the
awareness layer as a labelled cursor. Details in [Multiplayer](/multiplayer).

## Is it stable?

It's 0.x. The tool surface may still change between minor versions; the
[changelog](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/CHANGELOG.md)
lists changes per release.

## How do I report a bug or ask for something?

[Open an issue](https://github.com/alliecatowo/jupyterlite-web-mcp/issues/new)
for bugs, or start a thread in
[Discussions](https://github.com/alliecatowo/jupyterlite-web-mcp/discussions)
for ideas and questions.

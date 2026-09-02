# jupyterlite-webmcp

A JupyterLab 4 frontend extension that exposes the live JupyterLite
workspace to a compatible browser agent through
[WebMCP](https://github.com/webmachinelearning/webmcp)
(`document.modelContext.registerTool`).

It is frontend-only: there is no server extension and no backend, and it
runs unmodified in JupyterLite. If the browser does not expose
`document.modelContext`, the extension registers nothing and the rest of
the application is unaffected — the notebook and the Review panel work the
same either way.

For the full product story, human/agent examples, and tool table, see the
[repository README](../../README.md). For per-tool detail see
[`../../docs/webmcp-tools.md`](../../docs/webmcp-tools.md), and for the
review/comments feature see
[`../../docs/review-comments.md`](../../docs/review-comments.md).

Live demo: <https://jupyterlite-web-mcp.vercel.app/lab/index.html>

## Install

Not yet published to PyPI. Works in JupyterLab 4.6, Notebook 7, and
JupyterLite — install from a clone or directly from git:

```bash
pip install ./packages/jupyterlite-webmcp
# or
pip install "git+https://github.com/alliecatowo/jupyterlite-web-mcp.git#subdirectory=packages/jupyterlite-webmcp"
```

It is a prebuilt extension (the wheel ships compiled JS/CSS), so installing
it does not require Node.js or a build step. See
[`../../docs/install.md`](../../docs/install.md) for the JupyterLite
`requirements.txt` variant and how to verify the install.

## Plugins

This package contributes two plugins, both `autoStart: true`:

- **`jupyterlite-webmcp:review`** — the notebook review/comments feature.
  Reads and writes threaded comments stored in notebook metadata, adds the
  right-sidebar Review panel, and registers the commands (and matching
  context-menu items) a human uses to add, resolve, and reopen comments by
  hand. This plugin works whether or not the browser supports WebMCP; it
  provides the `IReviewStore` token that the tools plugin depends on.

- **`jupyterlite-webmcp:tools`** — WebMCP tool registration. Feature-detects
  `document.modelContext`; if present, builds and registers all 19 tools
  once, at activation, against the live notebook tracker and the review
  store above. If absent, it does nothing beyond an optional status-bar
  indicator.

## Install / build

From the repository root:

```bash
cd packages/jupyterlite-webmcp
npm install
npm run build:prod
```

Other useful scripts (see `package.json`): `npm run build` (development
build), `npm run watch`, `npm test` (jest unit tests), `npm run typecheck`.

This package is also installable as an editable Python package (see
`pyproject.toml`); the repository root's `requirements.txt` installs it with
`-e ./packages/jupyterlite-webmcp`.

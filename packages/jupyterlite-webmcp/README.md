# jupyterlite-webmcp

A JupyterLab 4 frontend extension that exposes your **live, in-browser
notebook** — the open cells, the running kernel, your mouse selection, the
review comments — to a browser-based AI agent through
[WebMCP](https://github.com/webmachinelearning/webmcp), the emerging W3C
proposal for a web page to register callable tools with an agent sharing the
same browser tab (`document.modelContext.registerTool`).

Concretely: once installed, a WebMCP-aware agent in your browser can read
your notebook's *live* cells (not stale `.ipynb` bytes off disk — the actual
unsaved state in memory), run code on the kernel you're already using, insert
or edit cells with conflict detection, and read/reply to review comments —
all subject to per-cell access control (`write` / `read` / `none`) that you
set. If your browser doesn't expose `document.modelContext` yet, the
extension registers nothing and your notebook behaves exactly as it always
has; nothing about the normal editing experience is gated behind it.

It is **frontend-only**: no server extension, no backend, no API keys, no
Python runtime dependencies (`dependencies = []`). Works unmodified in
JupyterLab 4.6, Notebook 7, and JupyterLite.

**Live demo:** <https://jupyterlite-web-mcp.vercel.app/lab/index.html>
**Full project README, design rationale, and the 22-tool reference:**
<https://github.com/alliecatowo/jupyterlite-web-mcp>

## Install

```bash
pip install jupyterlite-webmcp
```

Installs a prebuilt extension: no Node.js and no `jupyter lab build`. For
JupyterLite, add it to your site's requirements and run `jupyter lite build`;
see [`docs/install.md`](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/docs/install.md).

Once installed, confirm it registered:

```bash
jupyter labextension list
# jupyterlite-webmcp v0.1.0 enabled OK (python, jupyterlite_webmcp)
```

Then start `jupyter lab` or `jupyter notebook` as usual — no configuration
is required.

```bash
pip uninstall jupyterlite_webmcp
```

## What it contributes

Seven frontend plugins, all `autoStart: true`; the two you'll notice first:

- **`jupyterlite-webmcp:tools`** — registers the WebMCP tool surface
  (22 tools) when `document.modelContext` is present; otherwise a no-op
  beyond an optional status-bar indicator.
- **`jupyterlite-webmcp:review`** — a notebook review/comments panel.
  Threaded comments on a cell, a text range, or an output, stored in the
  notebook's own metadata. Works whether or not the browser supports WebMCP.

The rest provide the access-control panel and cell menu, the activity/presence
layer, Propose mode, the Agent panel and output selection.

See the [tool reference](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/docs/webmcp-tools.md)
for the full list of tools and their schemas, and
[`docs/install.md`](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/docs/install.md)
for the JupyterLite `requirements.txt` variant and how to check whether
WebMCP is active in your browser.

## Building from source (contributors)

Installing a built wheel of this package never requires Node.js — it ships
prebuilt JS/CSS. The package is not on PyPI yet, though, so today's
`pip install` from git or a clone builds that wheel for you and needs Node.js
on your `PATH`. To work on the extension's source:

```bash
git clone https://github.com/alliecatowo/jupyterlite-web-mcp.git
cd jupyterlite-web-mcp/packages/jupyterlite-webmcp
npm install
npm run build:prod
pip install -e .
```

Other useful scripts (see `package.json`): `npm run build` (development
build), `npm run watch`, `npm test` (Jest unit tests), `npm run typecheck`.

## License

MIT — see [LICENSE](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/LICENSE).

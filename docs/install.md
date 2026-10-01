# Installing jupyterlite-webmcp

This is a plain JupyterLab **prebuilt** frontend extension: the wheel ships
compiled JavaScript/CSS under `share/jupyter/labextensions/jupyterlite-webmcp/`,
so installing it from PyPI does not require Node.js, `npm`, or a local build
step. It has no server extension and no Python runtime dependencies
(`dependencies = []` in `pyproject.toml`).

## JupyterLab (or Notebook 7)

### Install from PyPI

```bash
pip install jupyterlite-webmcp
```

### Install from source (development, or unreleased changes)

From a clone of this repository:

```bash
pip install ./packages/jupyterlite-webmcp
```

Or directly from git, no clone needed:

```bash
pip install "git+https://github.com/alliecatowo/jupyterlite-web-mcp.git#subdirectory=packages/jupyterlite-webmcp"
```

Building from source runs `npm install` and the production webpack build via
`hatch-jupyter-builder`, so **Node.js must be on your `PATH`**; you never run
`npm` yourself.

Confirm it registered:

```bash
jupyter labextension list
# jupyterlite-webmcp vX.Y.Z enabled OK (python, jupyterlite_webmcp)
```

Then start JupyterLab or Notebook 7 as usual (`jupyter lab` / `jupyter
notebook`). No configuration is required — the extension activates
automatically and does nothing unless the browser exposes
`document.modelContext`.

The same install works for JupyterLab 4.6 and Notebook 7, which share one
extension system: there is no separate build or flag for either. Both, and
the JupyterLite demo, have been tested end to end (open, read, edit and run
cells through the WebMCP tools).

## JupyterLite

JupyterLite deployments are built from a `requirements.txt` (or equivalent
lockfile) listing the Python packages to bundle into the static site's
in-browser environment. Add `jupyterlite-webmcp` (unpinned or version-pinned,
same as any other requirement):

```text
jupyterlite-webmcp
# or, to build from this repository instead:
-e ./packages/jupyterlite-webmcp
```

then rebuild the site:

```bash
jupyter lite build --contents content --output-dir dist
```

This repository's own demo is built this way: see
[`requirements.txt`](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/requirements.txt) for a complete, working set of
pins (JupyterLite core, JupyterLab, Notebook, the Pyodide kernel and this
extension) and [`scripts/build-site.sh`](https://github.com/alliecatowo/jupyterlite-web-mcp/blob/main/scripts/build-site.sh) for the
build that Vercel and CI run.

## Uninstalling

```bash
pip uninstall jupyterlite_webmcp
```

Uninstalling only removes the tool surface; it does not touch any notebook,
file, or review comment already saved — comments live in the notebook's own
metadata, not in extension state.

## Verifying WebMCP is active

No stable browser ships `document.modelContext` yet. To check whether it is
present in the browser you're using:

```js
document.modelContext && typeof document.modelContext.registerTool === 'function'
```

If that is `false`, the extension registers nothing, and the notebook —
including the Agent panel — works exactly as it otherwise would. If it is
`true` and this extension is installed, all 22 tools register (see
`docs/webmcp-tools.md`) and the status bar reflects that an agent is
connected. See `docs/webmcp-compatibility.md` for how to enable WebMCP in a
Chromium build that has the trial, and its calling convention once enabled.

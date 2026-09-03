# Installing jupyterlite-webmcp

This is a plain JupyterLab **prebuilt** frontend extension: the wheel ships
compiled JavaScript/CSS under `share/jupyter/labextensions/jupyterlite-webmcp/`,
so installing it does not require Node.js, `npm`, or a local build step. It
has no server extension and no Python runtime dependencies
(`dependencies = []` in `pyproject.toml`).

**Not yet published to PyPI or npm** — both package names currently 404.
Install from a clone or directly from git.

## JupyterLab (or Notebook 7)

Both JupyterLab 4.6 and Notebook 7 ship on the same extension system, so the
same install works for either — verified against a real JupyterLab 4.6
server and a real Notebook 7 server, including a full open → read → update →
run round trip through the WebMCP tools.

From a clone of this repository:

```bash
pip install ./packages/jupyterlite-webmcp
```

Or directly from git, no clone needed:

```bash
pip install "git+https://github.com/alliecatowo/jupyterlite-web-mcp.git#subdirectory=packages/jupyterlite-webmcp"
```

Confirm it registered:

```bash
jupyter labextension list
# jupyterlite-webmcp v0.1.0 enabled OK (python, jupyterlite_webmcp)
```

Then start JupyterLab or Notebook 7 as usual (`jupyter lab` / `jupyter
notebook`). No configuration is required — the extension activates
automatically and does nothing unless the browser exposes
`document.modelContext`.

## JupyterLite

JupyterLite deployments are built from a `requirements.txt` (or equivalent
lockfile) listing the Python packages to bundle into the static site's
in-browser environment. Add one of the same two install targets:

```text
-e ./packages/jupyterlite-webmcp
# or, from git:
git+https://github.com/alliecatowo/jupyterlite-web-mcp.git#subdirectory=packages/jupyterlite-webmcp
```

then rebuild the site:

```bash
jupyter lite build --contents content --output-dir dist
```

This repository's own `requirements.txt` and `.github/workflows/deploy.yml`
do exactly this for the live demo — see the repository root for a complete,
working example (`jupyterlite-core==0.8.0`, `jupyterlab~=4.6.0`,
`notebook~=7.6.0`, `jupyterlite-pyodide-kernel==0.8.0`, plus this extension).

## Uninstalling

```bash
pip uninstall jupyterlite_webmcp
```

Uninstalling only removes the tool surface; it does not touch any notebook,
file, or review comment already saved — comments live in the notebook's own
metadata (see `docs/review-comments.md`), not in extension state.

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

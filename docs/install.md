# Installing jupyterlite-webmcp

This is a plain JupyterLab **prebuilt** frontend extension: the wheel ships
compiled JavaScript/CSS under `share/jupyter/labextensions/jupyterlite-webmcp/`,
so installing it does not require Node.js, `npm`, or a local build step. It
has no server extension and no Python runtime dependencies
(`dependencies = []` in `pyproject.toml`).

## JupyterLab (or Notebook 7)

### Target install: `pip install jupyterlite-webmcp`

```bash
pip install jupyterlite-webmcp
```

**This is not live yet.** The package is not currently published to PyPI —
`pip install jupyterlite-webmcp` will 404 until then. It is shown first
because it's the intended, permanent way to install this extension once
published, not because it works today. See
[`docs/release-checklist.md`](release-checklist.md) for exactly what
remains before that command works, and use the install-now instructions
below in the meantime.

### Install now, before PyPI publication

From a clone of this repository:

```bash
pip install ./packages/jupyterlite-webmcp
```

Or directly from git, no clone needed:

```bash
pip install "git+https://github.com/alliecatowo/jupyterlite-web-mcp.git#subdirectory=packages/jupyterlite-webmcp"
```

Both of these build the real wheel locally (via `hatchling` +
`hatch-jupyter-builder`, which runs `npm install` and the production webpack
build for you) and install it — functionally identical to what
`pip install jupyterlite-webmcp` will do once that name is live. The only
difference is where `pip` fetches the source from.

Confirm it registered:

```bash
jupyter labextension list
# jupyterlite-webmcp v0.1.0 enabled OK (python, jupyterlite_webmcp)
```

Then start JupyterLab or Notebook 7 as usual (`jupyter lab` / `jupyter
notebook`). No configuration is required — the extension activates
automatically and does nothing unless the browser exposes
`document.modelContext`.

**Verified, not just claimed:** both JupyterLab 4.6 and Notebook 7 ship on
the same extension system, so the exact same install works for either — no
branch, no build flag, no platform-specific code anywhere in this
package. That was checked directly against a real JupyterLab 4.6 server
*and* a real Notebook 7 server, each with a full open → read → update →
run round trip through the WebMCP tools, `jupyter_run_cells` executing on
a real ipykernel. Combined with the JupyterLite demo (the in-browser
Pyodide kernel, covered by the Playwright suite on every push), that is
three real environments from one unmodified install.

On top of that, the packaging itself — not just the git-install path — was
verified the way a brand-new user actually experiences it: `uv build`
(equivalently `python -m build`) from a genuinely clean `git clone`
produces the real sdist and wheel, installing *only that built wheel file*
(no `-e`, no git, no access to this repository at all) into a virtualenv
that had never seen this project reproduces the exact `enabled OK` result
above, and `jupyter lab` starts against it with no console errors and a
real notebook cell executing on a real kernel. That check caught and fixed
one real bug: the extension's `package.json` originally pinned its
`@jupyterlab/*`/`@lumino/*` dependencies to exact versions, which made the
built extension incompatible with any JupyterLab patch release other than
the one it was built against — every real user would have hit a red `X`
"incompatible" mark in `jupyter labextension list`. See
[`docs/release-checklist.md`](release-checklist.md) for the full record.

## JupyterLite

JupyterLite deployments are built from a `requirements.txt` (or equivalent
lockfile) listing the Python packages to bundle into the static site's
in-browser environment. Once published, `jupyterlite-webmcp` (unpinned or
version-pinned, same as any other requirement) is the entry to add; for now,
before publication, use one of the same two install targets already shown
above:

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

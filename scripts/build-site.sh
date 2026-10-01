#!/usr/bin/env bash
# Build the JupyterLite site, including the prebuilt frontend extension.
#
# Used by both the Vercel build and by anyone reproducing the deployment
# locally. jupyter-builder, which bundles the labextension, is a console
# script from the jupyterlab Python package, so the Python environment has to
# exist before the JavaScript build runs.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# Use the caller's interpreter if PYTHON is set; otherwise build in a project
# virtualenv (created here, with uv when available) so this works the same on a
# laptop, in CI, and on Vercel, none of which let you pip-install system-wide.
if [ -z "${PYTHON:-}" ]; then
  if [ ! -x .venv/bin/python ]; then
    echo "==> creating .venv"
    if command -v uv >/dev/null 2>&1; then
      uv venv .venv
    else
      python3 -m venv .venv
    fi
  fi
  PYTHON="$root/.venv/bin/python"
fi
python="$PYTHON"

# A host-provided PYTHONPATH (Vercel installs requirements.txt into its own
# directory) must not leak into our venv's view of what is installed.
unset PYTHONPATH

# jupyter-builder is installed alongside the selected interpreter, not
# necessarily alongside the shell's default Python. Honour PYTHON completely:
# without this, `PYTHON=.venv/bin/python ./scripts/build-site.sh` builds TypeScript
# successfully but fails when the builder executable cannot be found on PATH.
# Resolved to an absolute directory: npm lifecycle scripts run with cwd set to
# the package, so a relative bin directory would not resolve from there.
python_bin="$(cd "$(dirname "$(command -v "$python")")" && pwd)"
PATH="$python_bin:$PATH"
export PATH

# Install into "$python"'s environment. A uv-created virtualenv has no pip
# module of its own, so fall back to `uv pip` when that is what we are in.
install() {
  if "$python" -m pip --version >/dev/null 2>&1; then
    "$python" -m pip install --quiet --disable-pip-version-check "$@"
  elif command -v uv >/dev/null 2>&1; then
    uv pip install --quiet --python "$python" "$@"
  else
    echo "neither pip nor uv is available for $python" >&2
    return 1
  fi
}

echo "==> installing the extension build toolchain"
install "$(grep -i '^jupyterlab' requirements.txt)"

if [ ! -d packages/jupyterlite-webmcp/node_modules ]; then
  echo "==> installing npm dependencies"
  npm --prefix packages/jupyterlite-webmcp ci
fi

# Always install requirements.txt: pip and uv make this a no-op when every pin
# is already satisfied, and it means a pin bump takes effect even in a reused
# (or build-cached) virtualenv. It includes the editable install of the
# extension, whose build hook needs jupyterlab and node_modules from above.
echo "==> installing the JupyterLite build dependencies"
install -r requirements.txt

echo "==> building the frontend extension"
npm --prefix packages/jupyterlite-webmcp run build:prod

# The editable install snapshots the labextension into the environment's
# share/jupyter/labextensions instead of linking it, so a rebuilt extension is
# invisible to `jupyter lite build` until that copy is refreshed. Silently
# shipping a stale bundle is the worst possible failure here, so refresh it
# explicitly from what we just built.
echo "==> refreshing the installed labextension"
built="packages/jupyterlite-webmcp/jupyterlite_webmcp/labextension"
installed="$("$python" -c "import sys, os; print(os.path.join(sys.prefix, 'share', 'jupyter', 'labextensions', 'jupyterlite-webmcp'))")"
if [ -d "$built" ] && [ -e "$installed" ] && [ ! -L "$installed" ]; then
  rm -rf "$installed"
  mkdir -p "$(dirname "$installed")"
  cp -r "$built" "$installed"
  echo "    refreshed $installed"
fi

# JupyterLab refuses an extension whose shared dependencies (React, Lumino, ...)
# don't match the versions it provides, and reports it as "not compatible".
# Catch that here, so a dependency bump can never ship an extension users can't load.
echo "==> checking the extension is compatible with the installed JupyterLab"
labext="$(jupyter labextension list 2>&1)"
echo "$labext" | grep -i "jupyterlite-webmcp"
if echo "$labext" | grep -q "is not compatible"; then
  echo "ERROR: JupyterLab reports the extension as incompatible:" >&2
  echo "$labext" >&2
  exit 1
fi

echo "==> building the JupyterLite site"
rm -rf dist .jupyterlite.doit.db
"$python" -m jupyterlite_core.app build --contents content --output-dir dist

# Fail the build, instead of deploying a site with no extensions, if the
# frontend extension or the Pyodide kernel did not make it into dist/.
for ext in jupyterlite-webmcp @jupyterlite/pyodide-kernel-extension; do
  if [ ! -f "dist/extensions/$ext/package.json" ]; then
    echo "ERROR: dist/extensions/$ext is missing; the site would ship without it" >&2
    exit 1
  fi
done

echo "==> done: dist/"

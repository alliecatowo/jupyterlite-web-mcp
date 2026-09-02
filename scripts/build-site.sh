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

python="${PYTHON:-python3}"

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

# Skip an install that would be a no-op, so a local rebuild is fast.
have() { "$python" -c "import $1" >/dev/null 2>&1; }

echo "==> installing the extension build toolchain"
have jupyterlab || install "jupyterlab~=4.6.0"

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

echo "==> installing the JupyterLite build dependencies"
have jupyterlite_core || install -r requirements.txt

echo "==> building the JupyterLite site"
rm -rf dist .jupyterlite.doit.db
"$python" -m jupyterlite_core.app build --contents content --output-dir dist

# The deployment headers travel with the built site, so a prebuilt deploy of
# dist/ is cross-origin isolated exactly like a Git-integration build.
cp vercel.json dist/vercel.json

echo "==> done: dist/"

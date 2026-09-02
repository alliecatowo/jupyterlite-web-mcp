#!/usr/bin/env bash
# Copy the built JupyterLite site and inject the test-only WebMCP shim, so the
# extension's tools can be driven by hand in a real browser.
#
#   ./ui-tests/make-shim-site.sh [output-dir] [port]
#
# The deployed site is never modified.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
out="${1:-$root/dist-shim}"
port="${2:-8766}"

if [ ! -d "$root/dist" ]; then
  echo "dist/ does not exist. Build it first:" >&2
  echo "  jupyter lite build --contents content --output-dir dist" >&2
  exit 1
fi

rm -rf "$out"
cp -r "$root/dist" "$out"
cp "$here/manual-shim.js" "$out/webmcp-shim.js"

python3 - "$out/lab/index.html" <<'PY'
import sys

path = sys.argv[1]
tag = '<script src="../webmcp-shim.js"></script>'
html = open(path).read()
if tag not in html:
    html = html.replace('</head>', '  ' + tag + '\n</head>', 1)
    open(path, 'w').write(html)
print('injected the shim into', path)
PY

echo "serving $out on http://127.0.0.1:$port"
cd "$out" && exec python3 -m http.server "$port" --bind 127.0.0.1

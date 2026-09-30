#!/usr/bin/env bash
# Build the site and deploy it to Vercel as a prebuilt static app.
#
# Vercel is used rather than GitHub Pages because it can set
# Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy. Those headers
# make the page cross-origin isolated, which gives the Pyodide kernel worker a
# real SharedArrayBuffer instead of the service-worker fallback it otherwise
# has to use for synchronous communication. Pages cannot set headers at all.
#
#   ./scripts/deploy-vercel.sh            # production
#   ./scripts/deploy-vercel.sh --preview  # a shareable preview URL
#   SKIP_BUILD=1 ./scripts/deploy-vercel.sh  # reuse an already-fresh dist/
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

target="--prod"
if [ "${1:-}" = "--preview" ]; then
  target=""
fi

# Always rebuild: a stale dist/ silently ships an old site. Set SKIP_BUILD=1
# only when you have just built dist/ yourself.
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> building the site"
  ./scripts/build-site.sh
fi

# Vercel's Build Output API: dist/ is already built, so hand it over verbatim
# rather than letting Vercel try to build the JupyterLite output as a Node
# project (it ships a package.json, which Vercel would otherwise pick up).
echo "==> staging .vercel/output"
rm -rf .vercel/output
mkdir -p .vercel/output/static
cp -r dist/. .vercel/output/static/
rm -f .vercel/output/static/vercel.json

python3 - <<'PY'
import json

isolation = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
}
no_store = "no-cache, no-store, must-revalidate"

config = {
    "version": 3,
    "routes": [
        # The service worker and the entry documents must never be served from
        # a stale cache: a service worker left over from an earlier deploy can
        # hand back mismatched assets and leave the kernel unable to start.
        {
            "src": r"^/service-worker\.js$",
            "headers": {**isolation, "Cache-Control": no_store,
                        "Service-Worker-Allowed": "/"},
            "continue": True,
        },
        {"src": r"^/(.*\.html)$",
         "headers": {**isolation, "Cache-Control": no_store}, "continue": True},
        {"src": r"^/(.*jupyter-lite\.json)$",
         "headers": {**isolation, "Cache-Control": no_store}, "continue": True},
        {"src": r"^/(.*)$", "headers": isolation, "continue": True},
        {"handle": "filesystem"},
        {"src": "^/$", "status": 308, "headers": {"Location": "/lab/index.html"}},
    ],
}
with open(".vercel/output/config.json", "w") as handle:
    handle.write(json.dumps(config, indent=2) + "\n")
print("wrote .vercel/output/config.json")
PY

echo "==> deploying"
npx --yes vercel@${VERCEL_CLI_VERSION:-62.0.0} deploy --prebuilt --yes $target

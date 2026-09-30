#!/usr/bin/env bash
# Manual deploy. Pushes to main already deploy automatically through Vercel's
# Git integration; use this to ship from a laptop. Vercel builds the site
# remotely from vercel.json, exactly as it does for a Git push, so there is one
# build definition, not two.
#
#   ./scripts/deploy-vercel.sh            # production
#   ./scripts/deploy-vercel.sh --preview  # a shareable preview URL
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--preview" ]; then
  exec npx --yes vercel@"${VERCEL_CLI_VERSION:-62.0.0}" deploy --yes
fi
exec npx --yes vercel@"${VERCEL_CLI_VERSION:-62.0.0}" deploy --prod --yes

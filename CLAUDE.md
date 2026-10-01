# CLAUDE.md

JupyterLite WebMCP: a JupyterLab / JupyterLite extension that exposes the live
notebook to browser agents through WebMCP. Published on PyPI as
`jupyterlite-webmcp`; the demo at https://jupyterlite-web-mcp.vercel.app deploys
from `main` through Vercel's Git integration (config in `vercel.json`).
Owner and maintainer: @alliecatowo. Contributor: @mennymendoza (Juan Mendoza).

## Working rules

- **Worktrees go in `.claude/worktrees/` inside the repo. Never create git
  worktrees (or clones) under `/tmp` or the scratchpad.** Remove a worktree
  when its work is merged.
- Commit as `Allison Coleman <alliecatowo@users.noreply.github.com>` (matches
  the owner's GPG key so commits show as Verified). End commit messages with the
  `Co-Authored-By` line the harness specifies.
- Do not add README/docs claims about AI or Claude provenance.
- Don't publish, tag, or change repo settings/rulesets/tokens unless asked.
  Releases: bump the version in `packages/jupyterlite-webmcp/package.json`
  (single source), push a `vX.Y.Z` tag, approve the `pypi` environment.
- Prefer `npm` scripts, `mise` tasks or Python over new shell scripts, and never
  commit throwaway helper scripts. The only shell scripts are
  `scripts/build-site.sh` (the site build Vercel and CI both run),
  `scripts/deploy-vercel.sh` (manual deploy) and `ui-tests/make-shim-site.sh`.

## Tooling

`mise.toml` tracks the latest Node and uv and installs the Vercel CLI globally
(`npm:vercel`), so run `mise install` and use plain `vercel`. CI uses the latest
Node too (`engines` only sets a floor of 22). Vercel itself is capped at its own
Node 24.x setting.

## Checks (all required on `main`: `build`, `test`, `analyze`)

```bash
cd packages/jupyterlite-webmcp
npm ci && npm run typecheck && npx jest && npm run lint:check && npm run build:prod
./scripts/build-site.sh     # from the repo root; fails if the extensions are missing from dist/
```

## Docs site

`docs/` is a VitePress site (`cd docs && npm ci && npm run build`), deployed to
GitHub Pages by `.github/workflows/docs.yml` on pushes to `main` that touch
`docs/`. Base path is `/jupyterlite-web-mcp/`; set `DOCS_BASE=/` when it moves.
A dead link fails the build, so link repo files via github.com URLs.

## Automation (the owner has very limited time: keep it self-maintaining)

- Dependency updates are moving from Dependabot to Renovate (`renovate.json`),
  which merges as its own app (`renovate[bot]`); that app is the one actor the
  `main` ruleset lets bypass the 1-review rule. Until it is installed, bot PRs
  (including Copilot CodeQL autofixes) wait for a maintainer admin-merge once
  `build`, `test` and `analyze` pass: the auto-merge workflow runs as
  `github-actions`, which is not a bypass actor, so it cannot finish a merge on
  its own. A bump that breaks the build just stays open: fix it on its branch or
  ignore it.
- **Vercel previews are opt-in** (free-tier limit: ~100 deployments/day, and a
  blown limit blocks production deploys). `vercel.json`'s `ignoreCommand` builds
  only `main` and branches named `preview/*`; every other branch, including all
  bot PRs, is skipped. Only push a `preview/...` branch when you actually need a
  live preview of a change, and delete it afterwards. The Vercel check is never
  a required check; `build`/`test`/`analyze` are.
- After any merge that touches the build, confirm the live demo:
  `/jupyter-lite.json` lists `jupyterlite-webmcp`, and
  `/extensions/jupyterlite-webmcp/package.json` returns 200.

## Things that bit us

- Notebook metadata keys `jupyterlite_webmcp` and `jupyterlite_webmcp_review`
  are saved-file data; never rename them.
- Access levels (`write`/`read`/`none`) are a tool-level guardrail, not a
  sandbox (see the README threat model).

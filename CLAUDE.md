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
  `scripts/build-site.sh` (the site build Vercel and CI both run) and
  `ui-tests/make-shim-site.sh`.

## Checks (all required on `main`: `build`, `test`, `analyze`)

```bash
cd packages/jupyterlite-webmcp
npm ci && npm run typecheck && npx jest && npm run lint:check && npm run build:prod
./scripts/build-site.sh     # from the repo root; fails if the extensions are missing from dist/
```

## Automation (the owner has very limited time: keep it self-maintaining)

- Dependabot and Copilot (CodeQL autofix) PRs get auto-merge enabled by
  `.github/workflows/dependabot-automerge.yml` and merge themselves once the
  required checks pass. The `main` ruleset lets those bots bypass the human
  review; everyone else needs 1 review. A bump that breaks the build just stays
  open: fix it on its branch or `@dependabot ignore` it.
- Vercel skips builds for `dependabot/*` and `copilot/*` branches (free-tier
  build rate limit).
- After any merge that touches the build, confirm the live demo:
  `/jupyter-lite.json` lists `jupyterlite-webmcp`, and
  `/extensions/jupyterlite-webmcp/package.json` returns 200.

## Things that bit us

- Notebook metadata keys `jupyterlite_webmcp` and `jupyterlite_webmcp_review`
  are saved-file data; never rename them.
- Access levels (`write`/`read`/`none`) are a tool-level guardrail, not a
  sandbox (see the README threat model).

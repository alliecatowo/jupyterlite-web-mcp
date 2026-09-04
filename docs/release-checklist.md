# Release checklist: publishing `jupyterlite-webmcp` to PyPI

This is a plain checklist of what remains before `pip install jupyterlite-webmcp`
can be true. It is **not yet run** — publishing to PyPI claims a real,
essentially irreversible public package name, so the actual `twine upload` /
`uv publish` step waits for an explicit go-ahead. Everything below it has
already been verified from a real, from-scratch build; the checklist exists
so that when the go-ahead comes, publishing is a five-minute, low-risk
action rather than a debugging session.

## Already verified (see the PR/commit that added this file for the full log)

- [x] `uv build .` (equivalently `python -m build .`, since the project
      declares a standard `hatchling` build backend) produces both a wheel
      and an sdist from a genuinely clean `git clone` — no local caches, no
      pre-built `lib/`, no pre-built `jupyterlite_webmcp/labextension/`. The
      build hook (`hatch-jupyter-builder`) runs `npm install` and
      `npm run build:prod` itself; nothing needs to be pre-built by hand.
- [x] The built **wheel file** (not `-e .`, not a git install) installs
      cleanly with `pip`/`uv pip` into a **brand-new virtualenv** that has
      never seen this repo.
- [x] `jupyter labextension list` in that fresh venv shows
      `jupyterlite-webmcp v0.1.0 enabled OK` — no compatibility warning.
      (This caught a real bug: `package.json` originally pinned
      `@jupyterlab/*`/`@lumino/*` dependencies to exact versions, e.g.
      `"4.6.0"` instead of `"^4.6.0"`. That makes the built extension
      compatible with *only* the exact patch version of JupyterLab it was
      built against — every real user, who gets whatever current patch
      `pip install jupyterlab` resolves to, would have seen a red `X`
      "incompatible" mark. Fixed by switching those to caret ranges, which
      is also what the official JupyterLab extension templates use.)
- [x] `jupyter lab` starts in that fresh venv with the extension active and
      no console/log errors attributable to it; a real `.ipynb` opens and
      runs.
- [x] The package's own `README.md` (which becomes the PyPI page verbatim,
      via `readme = "README.md"` in `pyproject.toml`) stands on its own for
      a reader who has never seen this repository, and its links are
      absolute GitHub URLs rather than repo-relative paths (relative links
      like `../../README.md` render as dead links on PyPI, since the PyPI
      page is not served from inside the repo tree).
- [x] `docs/install.md` documents both the pre-publish (git-based) install
      and the post-publish (`pip install jupyterlite-webmcp`) install, the
      latter clearly marked as not yet live.

## What the repo owner still needs to decide/do

1. **A PyPI account** (pypi.org) with two-factor auth enabled (PyPI has
   required 2FA for all accounts since 2024).
2. **An API token.** From the PyPI account settings, create a token:
   - For the *first* publish of a new project name, the token must be
     account-scoped (project-scoped tokens can't be created until the
     project exists on PyPI).
   - After the first publish, go back and create a project-scoped token
     limited to `jupyterlite-webmcp`, and use that one from then on — never
     leave a long-lived account-wide token lying around.
3. **Decide whether to test on TestPyPI first.** Not required, but a free
   dry run: `test.pypi.org` accepts the exact same upload flow with a
   separate account/token, and lets you `pip install --index-url
   https://test.pypi.org/simple/ jupyterlite-webmcp` to confirm the real
   listing before touching the production index. Recommended given this is
   a first publish under this name.

## The actual publish, when ready

From `packages/jupyterlite-webmcp`, in a clean checkout (or after
`rm -rf dist/ jupyterlite_webmcp/labextension jupyterlite_webmcp/_version.py
lib/`, so nothing stale sneaks into the sdist):

```bash
# 1. Build (produces dist/jupyterlite_webmcp-<version>-py3-none-any.whl
#    and dist/jupyterlite_webmcp-<version>.tar.gz)
uv build --out-dir dist .
# or, the more universal spelling of the same thing:
#   python -m pip install build && python -m build --outdir dist .

# 2. Sanity-check the built artifacts one more time before they go anywhere
#    public — this repeats step 1's verification against the *exact*
#    files about to be uploaded, not an earlier build.
uv venv /tmp/pypi-smoke-test && source /tmp/pypi-smoke-test/bin/activate
uv pip install dist/jupyterlite_webmcp-*-py3-none-any.whl "jupyterlab>=4,<5"
jupyter labextension list   # expect: jupyterlite-webmcp ... enabled OK
deactivate && rm -rf /tmp/pypi-smoke-test

# 3. Upload
uv publish dist/*
# or, the twine equivalent (needs `pip install twine` first):
#   twine upload dist/*
```

Both `uv publish` and `twine upload` prompt for credentials the same way:
set `UV_PUBLISH_TOKEN` (for `uv publish`) or `TWINE_USERNAME=__token__` and
`TWINE_PASSWORD=<the pypi-... token>` (for `twine`) as environment
variables, or store the token in `~/.pypirc`. Do not type the token as a
CLI argument (it ends up in shell history).

## Immediately after publishing

- [ ] `pip install jupyterlite-webmcp` from a throwaway venv, against the
      real PyPI index, to confirm the listing works exactly as tested here
      against the local build.
- [ ] Update `docs/install.md` and `packages/jupyterlite-webmcp/README.md`
      to drop the "not yet published" framing and promote the `pip install
      jupyterlite-webmcp` command from "target end state" to the sole
      lead instruction (the git-install path can stay as a documented
      alternative for people who want an editable/dev install).
- [ ] Tag the release in git (e.g. `git tag v0.1.0 && git push --tags`) —
      not done automatically by either publish command above.
- [ ] If publishing to npm too (`packages/jupyterlite-webmcp`'s
      `package.json` — a separate, independent decision from the PyPI
      publish): `npm publish` from the same directory, after the same
      `npm run build:prod`. This project's `publishConfig.access` is
      already set to `"public"`. Not covered by this checklist's PyPI
      verification above — treat as a second, separate go/no-go decision,
      since claiming `jupyterlite-webmcp` on the npm registry is an equally
      irreversible action under a different registry's rules.

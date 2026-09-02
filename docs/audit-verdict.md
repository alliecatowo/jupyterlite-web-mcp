# Audit verdict — 2026-09-02

## Scope

Audit of the feature work in:

- `3ad91b3` — per-cell agent access control, provenance, and installation
  documentation.
- `fdf3fd6` — activity/presence, output-selection capture, ask-about UI,
  export, and WebMCP tool-contract hardening.

## Verdict: conditional pass

The implementation is internally consistent and functionally healthy under a
fresh JupyterLite build. It is suitable for merge/release **after one
reproducibility fix** to the site-build script. No test failures were found.

## Evidence

| Check | Result |
| --- | --- |
| Extension unit tests | Pass — 18 suites, 299 tests |
| TypeScript | Pass — `tsc --noEmit` |
| Formatting | Pass — Prettier check |
| Lint | Pass with 2 warnings |
| Fresh extension + JupyterLite build | Pass when using the project virtualenv on `PATH` |
| Browser E2E against newly built `dist/` | Pass — 38 Playwright tests |

The browser suite covered the shipped tool-registration contract and the
existing notebook CRUD, context, review, execution, workspace, and status
flows. It ran against a newly built static artifact rather than the older
Vercel deployment.

## What is working well

- The access-control model is intentionally narrow: `write`, `read`, and
  `none` are enforced at central cell-resolution checkpoints, while `none`
  avoids revealing hidden-cell existence.
- Agent edits retain source-hash stale-write protection and now have
  provenance/activity presentation around them.
- Output selection is recorded only when it can be attributed to one notebook
  output; this is materially safer than forwarding arbitrary browser text
  selection.
- Tool handlers now defensively validate numeric ranges, enumerations, and
  bounded text rather than assuming a WebMCP caller enforces JSON Schema.
- The test expectations were updated to the current 22-tool local contract,
  including access, export, and output-selection tools.

## Required before release

### Fix `scripts/build-site.sh` virtualenv command discovery

`scripts/build-site.sh` accepts a `PYTHON` interpreter, but calls
`jupyter-builder` through the ambient `PATH`. Running:

```sh
PYTHON="$PWD/.venv/bin/python" ./scripts/build-site.sh
```

fails because `.venv/bin/jupyter-builder` is not discoverable. The same build
succeeds when `.venv/bin` is prepended to `PATH`.

The script should derive the interpreter's bin directory and prepend it before
the JavaScript build, for example:

```sh
python_bin="$(dirname "$python")"
PATH="$python_bin:$PATH"
export PATH
```

Do this near the existing `python="${PYTHON:-python3}"` setup. This keeps the
documented `PYTHON` override honest and prevents local/CI packaging drift.

## Non-blocking cleanup

- `packages/jupyterlite-webmcp/src/webmcp/register.ts` has two ESLint
  warnings for unused caught `error` variables in best-effort activity code.
  Change `catch (error)` to `catch` when the error is intentionally ignored.
- Add direct browser coverage for the new output-selection UI and
  `jupyter_get_output_selection`, plus an export-result assertion. The
  registration test proves those tools are present, but not their complete UI
  handoff behavior.
- Deploy the rebuilt artifact before describing the Vercel demo as a 22-tool
  implementation. The currently observed hosted demo was an older 19-tool
  build.

## Retest gate

After the build-script fix, rerun:

```sh
PYTHON="$PWD/.venv/bin/python" ./scripts/build-site.sh
npm --prefix ui-tests test
npm --prefix packages/jupyterlite-webmcp test -- --runInBand
npm --prefix packages/jupyterlite-webmcp run typecheck
npm --prefix packages/jupyterlite-webmcp run lint:check
```

The verdict becomes a full pass when the first build command works without a
manual `PATH` workaround and browser tests cover output selection/export
behavior.

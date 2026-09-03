# Audit verdict

## 2026-09-02 (superseded) — conditional pass

The first audit covered `3ad91b3` (per-cell access control, provenance,
installation docs) and `fdf3fd6` (activity/presence, output-selection
capture, ask-about UI, export, tool-contract hardening). It found no test
failures and returned a **conditional pass**, gated on one reproducibility
fix and one deployment fact:

| Condition | Resolution |
| --- | --- |
| `scripts/build-site.sh` called `jupyter-builder` through the ambient `PATH`, so `PYTHON=.venv/bin/python ./scripts/build-site.sh` failed | **Fixed in `2894cb0`** — the script now derives the interpreter's bin directory and prepends it, so the documented `PYTHON` override is honest |
| Two ESLint warnings for unused caught `error` bindings in `src/webmcp/register.ts` | **Fixed** — `npm run lint:check` is clean |
| The hosted demo was still an older 19-tool build | **Fixed** — the deployed bundle now serves all 22 tools |
| No browser coverage for output selection / export | **Fixed** — the Playwright suite grew from 38 to 46 tests |

Its recorded evidence (18 suites / 299 unit tests, 38 Playwright tests) is
kept here only as history. **It no longer describes the code.** The numbers
below do.

---

## 2026-09-02 (current) — full pass

### Scope

`ded13c3` — the state of `main` at submission time, including notebook-level
access control (`3aa189d`), the consolidated Agent panel and the
focus-selection leak fix (`6e639ff`), the review-anchor access leak fix
(`97d266a`), and the shared-state audit closures (`ded13c3`).

### Verdict: **pass**

Every condition from the previous audit is resolved. No blocking issue
remains.

### Evidence

| Check | Result |
| --- | --- |
| Extension unit tests | **Pass — 24 suites, 361 tests** (`npm --prefix packages/jupyterlite-webmcp test`) |
| Browser E2E against the built `dist/` | **Pass — 46 Playwright tests** across 7 spec files |
| TypeScript | Pass — `tsc --noEmit` |
| Lint + formatting | Pass — ESLint clean, Prettier clean |
| CI on `ded13c3` | Pass — both `Test` and `Site Build` workflows green |
| Reproducible site build | Pass — `PYTHON="$PWD/.venv/bin/python" ./scripts/build-site.sh` succeeds with no `PATH` workaround |
| Tool surface in source | 22 `jupyter_*` tools |
| Tool surface **on the live deployment** | 22 — verified by fetching `https://jupyterlite-web-mcp.vercel.app/extensions/jupyterlite-webmcp/static/*.js` and extracting the registered names |
| Deployed build == local build | Pass — deployed `remoteEntry.6c88d727001a6a07.js` has the same content-hashed filename as the local `dist/` built from `ded13c3` |
| Cross-origin isolation | Pass — live response carries `cross-origin-opener-policy: same-origin` and `cross-origin-embedder-policy: credentialless` |
| Status-bar contract | `WebMCP ready` / `WebMCP unavailable` / `WebMCP error` / `Agent · <live phrase>` — verified present in the deployed bundle |

### What is working well

- **The access-control model is intentionally narrow.** `write`, `read` and
  `none` are enforced at central cell- and notebook-resolution checkpoints,
  and `none` never reveals a hidden cell's existence — listing, focus,
  export, output selection, and comment threads all agree, returning
  `CELL_NOT_FOUND` / `NOTEBOOK_NOT_FOUND` rather than a leakier code.
- **Stale-write protection holds.** `expectedSourceHash` is required on every
  source mutation and refused rather than merged, and the same guard was
  observed protecting a *remote* human's unsaved edit through
  `jupyter-collaboration` (`docs/multiplayer.md`).
- **Presence is honest.** The status bar distinguishes a genuinely in-flight
  invocation from a recently-completed one and says so
  (`src/ui/statusText.ts`); the halo lifetime is documented as a deliberate
  stand-in rather than dressed up as a live timer.
- **Output selection is attributed, not scraped.** A selection is recorded
  only when it lies wholly inside one output wrapper, is rejected inside
  rich/non-text widgets, and carries an output fingerprint so a later reader
  can detect replacement.
- **Tool handlers validate defensively** — numeric ranges, enumerations and
  bounded text are all checked in the handler rather than assumed to have
  been enforced by a WebMCP caller's JSON Schema pass.
- **Write inputs are rejected, not truncated.** `MAX_CELL_SOURCE_WRITE_BYTES`
  is deliberately larger than the read bound, because a write is real
  notebook content the human keeps.

### Non-blocking observations

- The `Show Review Panel` command label predates the panel consolidation; the
  command correctly reveals the Agent panel's Comments tab. Cosmetic only.
- The agent is not represented in the Yjs *awareness* layer, so remote
  collaborators see its edits arrive without a labelled cursor. Documented in
  `docs/multiplayer.md` and deliberately not claimed as done.
- Real-time collaboration is absent from the hosted demo by decision, not by
  oversight; the reasoning is recorded in `docs/multiplayer.md`.

## 2026-09-03 — open product gaps

Recorded as gaps rather than treated as supported behavior. None of these is
a regression; each is a capability that does not exist yet, or a fix that is
not yet complete.

### Reported by the notebook owner

| # | Gap | Status |
| --- | --- | --- |
| G1 | The automatic default-kernel selection still falls through to the Select Kernel prompt in a fresh tab | **Not complete.** See the finding below — the current change cannot reach the failing path. |
| G2 | No one-step "apply edit and run" tool. `jupyter_update_cell` then `jupyter_run_cells` is two round trips for what is one intention. | Open. Deliberate today (edit and execution are separately auditable), but the ergonomic cost is real. |
| G3 | The agent-edit diff popover shows what changed but offers no rollback. | Open. `before`/`after` are already captured in `ActivityMarkers._recordDiff`, so the data for a revert exists; only the control is missing. |
| G5 | The Playwright suite is flaky; CI's `retries: 1` masks it | Open. See below. |
| G4 | `jupyter_get_context` reports notebook-cell focus but not the Jupyter shell's active UI selector/picker state, so an agent cannot see or act on a dialog, launcher, or kernel picker the human is looking at. | Open. This is a genuine widening of "live state": today the context model is notebook-scoped by construction. |

### Findings from verifying G1

- **`resolveKernelName` is reachable from exactly one call site**
  (`src/jupyter/notebook.ts:299`, inside `createNotebook`). It therefore
  affects `jupyter_create_notebook` only. Opening an existing notebook — by
  double-click in the file browser, or through `jupyter_open_notebook` —
  never calls it, so the change cannot fix a Select Kernel prompt on a fresh
  tab. That is consistent with the reported symptom persisting.
- **The seeded notebooks are not the cause.** All four notebooks in
  `content/` carry a well-formed
  `metadata.kernelspec` (`{"name": "python", "language": "python",
  "display_name": "Python (Pyodide)"}`) and `language_info.name: python`.
- Consequently the remaining fix is most likely a JupyterLite/docmanager
  configuration concern rather than a tool-path concern, and should be
  investigated there before more code is added to `resolveKernelName`.
- ~~No test covers the new no-request branch.~~ **Closed.**
  `tests/unit/kernel-resolution.spec.ts` now pins all of it: registered
  default, a default naming an unregistered spec, Python preferred by name,
  Python matched by `language`, deterministic first-spec fallback, the empty
  registry, and the pre-existing requested-name/language behavior.

### Widgets: removed from the default fixture (2026-09-03)

`customer-analysis.ipynb` carried a `widgets.interact` slider cell
(`widget-md`, `spend-widget`). It is gone, and `ipywidgets` is out of
`requirements.txt`.

- **It was not reliably working.** `jupyterlite-pyodide-kernel` bundles
  `widgetsnbextension` (the frontend shim) in its wheel index but **not**
  `ipywidgets` itself, so `import ipywidgets` in the in-browser kernel
  depends on resolving the package from a CDN at runtime. Reported as not
  working during a live demo.
- **No tool could drive it anyway.** There is no widget tool among the 22,
  and no ipywidgets-specific code anywhere in `src/`. An agent can neither
  read a widget's value nor move a slider. A `widgets.interact` output also
  lives in a child output area rather than the cell's `outputs`, so even
  `jupyter_get_cells` with `includeOutputs` returns nothing useful about it.
  The cell was therefore inert in a demo whose entire subject is what the
  agent and the human can both act on.
- **What a real version would need**, if it is ever wanted: bundling the
  `ipywidgets` wheel into the site's piplite index so the import resolves
  locally, plus a tool surface for reading widget state — most naturally by
  having the agent insert a visible cell that prints `slider.value`, which
  needs no new tool at all but does need the widget bound to a named
  variable rather than created anonymously by `interact`.

### G5 — the browser suite is flaky, and CI hides it (2026-09-03)

`playwright.config.ts` sets `retries: process.env.CI ? 1 : 0`. Two
back-to-back local full runs each failed exactly one test, and a *different*
one each time (`cells.spec.ts:117` then `context.spec.ts:109`); both pass in
isolation, 8/8. CI's single retry turns those into green runs, so the
flakiness is real but invisible there. Nothing is deterministically broken —
but the suite's signal is weaker than the green badge implies, and the flakes
should be diagnosed rather than retried away.

### Note on a false negative while verifying this (2026-09-03)

Driving the deployed site through browser automation showed `No Kernel` and a
Select Kernel dialog, and `serviceManager.kernelspecs` reporting zero specs.
That was **not** a product fault. The profile carried a remembered "No
Kernel" choice plus a restored workspace, and repeated `Runtime.evaluate`
calls timed out because the main thread was blocked by Pyodide booting.
Running `ui-tests/execution.spec.ts` against the same `dist/` passes all five
tests in under ten seconds, including the one asserting a real
`executionCount` and `4` rendered in the output area. Recorded here so the
same false trail is not followed twice: **trust the Playwright suite over
hand-driven automation for kernel questions.**

### Findings from verifying the deploy

- **The live deployment was built from an uncommitted working tree.** The
  hosted bundle (`remoteEntry.8d730211c20cd89a.js`) matches the local
  `dist/`, but that `dist/` was built from changes that existed on no commit:
  `src/jupyter/notebook.ts`, `src/review/panel.tsx` and `src/ui/panel.tsx`
  were all modified and unstaged. Those changes are committed as of this
  entry, restoring the invariant that the deployed artifact corresponds to a
  reachable SHA. **This must hold at submission time**, since the submission
  packet cites a commit SHA as the thing judges will build.
- The uncommitted work itself was sound: `tsc --noEmit` clean, ESLint and
  Prettier clean, 361 unit tests passing.
- **The new Comments-tab controls ship unstyled.** `jp-webmcp-addComment` and
  `jp-webmcp-commentHelp` are referenced by `src/review/panel.tsx` but have no
  rule in `style/base.css`.

### Work reported against the live site, and where it actually lives

A full-notebook batch run, two review threads resolved, and notebook edits
were reported against the deployed site. Those act on the **browser-local
IndexedDB workspace**, not on this repository: they are real, and they are
invisible to anyone else opening the same URL. Nothing in `content/` changed,
which is correct and expected. Any notebook state a judge should see has to be
committed to `content/` and redeployed.

### Independent verification

`CODEX_DRIVER.md` is the black-box protocol for re-running this audit from
outside: it drives the deployed site through its real `document.modelContext`
surface, tool by tool and flow by flow, without reading the repository
source.

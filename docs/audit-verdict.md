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
| Extension unit tests | **Pass — 23 suites, 350 tests** (`npm --prefix packages/jupyterlite-webmcp test`) |
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

### Independent verification

`CODEX_DRIVER.md` is the black-box protocol for re-running this audit from
outside: it drives the deployed site through its real `document.modelContext`
surface, tool by tool and flow by flow, without reading the repository
source.

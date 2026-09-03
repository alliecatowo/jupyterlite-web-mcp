# SUBMISSION.md — internal canonical submission packet

**This is an internal working document, not a hackathon-required file.** It is
the single source of truth used to fill in the Devpost submission form. Judges
are not expected to read it; everything a judge needs is in
[`README.md`](README.md).

---

## 1. Verified official rules and URLs

**Verified 2026-09-02, 19:55 America/Los_Angeles**, by fetching the official
pages directly.

| Item | Value |
| --- | --- |
| Challenge | The WebMCP Challenge (OpenAI, with Chrome, Cloudflare, Shopify, Vercel, Render, Netlify) |
| Devpost home | <https://webmcp.devpost.com/> |
| Official rules | <https://webmcp.devpost.com/rules> |
| Resources | <https://webmcp.devpost.com/resources> |
| OpenAI page | <https://openai.com/webmcp-challenge/> |
| Registration + submission period | 2026-08-25 11:00 PT → **2026-09-03 13:00 PT** |
| Judging period | 2026-09-04 10:00 PT → 2026-09-21 17:00 PT |
| Winners announced | on or around 2026-09-23 |
| Prize | Top 10 each: $3,000 cash + Codex Micro + 1yr ChatGPT Pro + sponsor credits ($35,000 total pool) |

### Rules text that constrains us (quoted from the official rules page)

- Live URL: "a working live URL that judges can access using ChatGPT's in-app
  browser or Google Chrome with WebMCP enabled."
- Text description must explain: why the use case fits WebMCP; how it improves
  the user experience; what people and agents can accomplish together that was
  difficult or impossible before; and the WebMCP implementation approach.
- Code repository (GitHub, GitLab, or Bitbucket) containing "all necessary
  source code, assets, and instructions required for the project to be
  functional" and **"must be open source by including an open source license
  file."**
- Demonstration video: **"must be less than three (3) minutes"**, **"must be
  uploaded to and made publicly visible on YouTube"**, and **"must include a
  clear demo of your project functioning and with audio that covers what you
  built and how you used WebMCP."** No unauthorized third-party trademarks or
  copyrighted material.
- Eligibility: residents of countries where OpenAI API access is supported
  (excludes Brazil, China, Cuba, Iran, Russia, and others listed on the rules
  page). **Entrant is a US resident — eligible.**

### Judging criteria (four, equally weighted at 25% each)

1. **WebMCP Leverage** — implementation thoroughness; working, non-trivial
   application.
2. **Execution** — complete, coherent product experience.
3. **Potential Impact** — credible case for solving real problems for real
   audiences.
4. **Creativity & Ambition** — novelty and differentiation.

---

## 2. Requirement / evidence compliance matrix

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| R1 | Working live URL, reachable in ChatGPT in-app browser or Chrome+WebMCP | ✅ deployed | <https://jupyterlite-web-mcp.vercel.app/lab/index.html> returns `HTTP/2 200`, `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: credentialless` |
| R2 | Live build actually contains the shipped tool surface | ✅ verified | The deployed bundle `extensions/jupyterlite-webmcp/static/*.js` contains all 22 `jupyter_*` tool names and the current status strings; content-hashed filenames match the local `dist/` built from `8955801` |
| R3 | Description covers *why WebMCP fits* | ✅ | `README.md` § "Why this is specifically a strong WebMCP use case"; §6 of this document |
| R4 | Description covers *how it improves UX* | ✅ | `README.md` § "The problem, and who has it" + § "What humans and agents can do together" |
| R5 | Description covers *what humans + agents do together that was hard before* | ✅ | `README.md` § "What humans and agents can do together"; bidirectional pointing, shared kernel, shared review threads |
| R6 | Description covers *implementation approach* | ✅ | `README.md` § "How WebMCP is actually implemented"; `docs/webmcp-compatibility.md` |
| R7 | Public code repository with all source + instructions | ✅ verified | `gh repo view` reports `"visibility":"PUBLIC"`; README, LICENSE, SUBMISSION.md and CODEX_DRIVER.md all return `200` to an unauthenticated request |
| R8 | Open source license file in the repo | ✅ | `LICENSE` (MIT); third-party attribution in `NOTICE.md` |
| R9 | Demo video < 3 minutes | ⛔ not recorded | Production playbook is `DEMO.md`; target runtime 2:50 |
| R10 | Video publicly visible on YouTube | ⛔ not uploaded | URL slot in §9 below |
| R11 | Video audio covers *what was built* and *how WebMCP was used* | ⛔ pending recording | Narration in `DEMO.md` explicitly covers build, problem, why WebMCP, and how WebMCP was implemented |
| R12 | No unauthorized third-party trademarks / copyrighted material in video | ✅ by construction | No music, no third-party branding; all footage is the project's own UI |
| R13 | Eligible entrant | ✅ | US resident |
| R14 | Submitted before 2026-09-03 13:00 PT | ⏳ | See `CHECKLIST.md` |

---

## 3. Final project name

**JupyterLite WebMCP**

## 4. Final tagline

> A portable semantic interface to a browser-native computational workspace.

Devpost "tagline" field (short form, ≤ 200 chars):

> Your notebook is already in the browser — now your agent can be too. 22
> WebMCP tools over the live JupyterLite notebook: unsaved edits, your mouse
> selection, the shared kernel, and threaded review.

## 5. Live URL

```text
https://jupyterlite-web-mcp.vercel.app/lab/index.html
```

## 6. Final paste-ready Devpost description

<!-- Paste everything between the markers into the Devpost "About the project" field. -->
<!-- BEGIN DEVPOST DESCRIPTION -->

### JupyterLite WebMCP

**A portable semantic interface to a browser-native computational workspace.**

Live demo: https://jupyterlite-web-mcp.vercel.app/lab/index.html
Repository: https://github.com/alliecatowo/jupyterlite-web-mcp

#### The problem

A data scientist's working notebook lives in a browser tab, and almost none of
what matters about it exists on disk. The cell you just typed and haven't
saved. The eleven characters you highlighted with your mouse because they look
wrong. The kernel holding your DataFrame in memory. The chart that only
rendered because you ran cells in that order.

Getting an AI to help with that means one of two bad deals today. Copy-paste
into a chat window: the model sees a dead snapshot, hands back text, and you
re-key it — it cannot see your selection, cannot run anything, cannot know
what already ran. Or bolt in a server-side MCP integration: it reads `.ipynb`
bytes off disk, which is to say it reads a file that does not match your
screen, and it needs a Jupyter server, credentials, and infrastructure. On
JupyterLite there is no server to talk to at all.

#### Why this is a WebMCP use case specifically

The state that matters exists **only inside the browser tab**. There is no
backend holding it, so there is nothing for a conventional MCP server to
connect to. WebMCP is not the convenient option here — it is the only one.

All 22 registered tools operate on tab-local state:

- the live `NotebookPanel` model, including edits never saved to disk
  (`jupyter_get_cells` reads `sharedModel.getSource()`, never `.ipynb` bytes);
- the human's current cell, cursor, and exact text selection
  (`jupyter_get_context` → `focus.textSelection`);
- the in-browser Pyodide/WebAssembly kernel that is *shared* with the human
  (`jupyter_run_cells`, `jupyter_kernel_action`);
- the IndexedDB-backed contents manager (`jupyter_list_workspace`,
  `jupyter_create_notebook`);
- threaded review conversations stored in the notebook's own metadata
  (`jupyter_list_comments` and six siblings).

None of this is proxied through or duplicated into an external service.

#### What people and agents can do together that was hard before

**Pointing is bidirectional.** You highlight `converted / visitors` with your
mouse and say "fix just what I selected" — the agent reads that exact
substring, not the whole cell, not a re-parsed file. Ask "where is churn
actually calculated?" and the notebook scrolls itself and selects the
`churn_rate=("churned", "mean")` expression. Two participants pointing at
things the way a pair of humans at one keyboard would.

**One kernel, one document.** The agent runs cells on the kernel that already
has your data loaded. Execution counts increment in your notebook. Outputs
appear where you're looking. There is no shadow copy anywhere.

**The human always wins a conflict.** Every mutating tool requires the
`sourceHash` from a prior read. If you edited the cell in between, the agent's
write is refused with a structured `STALE_CELL` error carrying the current
hash and a preview — never silently merged, never overwritten.

**You can see it working.** When the agent acts, the notebook says so — no
chat transcript required. The targeted cell gets a calm ring and a decaying
left-edge tint colour-coded by what is happening. An inline badge under the
cell reads `Reading…` → `Applying…` → `Running…` → `Done`, or `Failed` (click
it for the structured error code and the duration in milliseconds). Any cell
the agent edited grows a **`±7 changed`** button that opens a real
before/after line diff. Any output the agent produced is labelled
`Run by Browser agent · 14:03:21`. And the status bar refuses to overclaim: a
page can only observe whether its tools registered and whether one was just
invoked — never whether an agent is present — so the idle string describes the
page (`WebMCP ready`), and the only string that names an agent is the live one
(`Agent · running cell 6`), which appears exactly when one demonstrably acted.
It even distinguishes a call genuinely in flight from one that merely just
finished, and only claims the former when it is true. Every cell keeps a bounded history of
who last changed it, human or agent. None of this can affect a tool result:
the whole presence layer only decorates the DOM, swallows its own errors, and
honors `prefers-reduced-motion`.

**The notebook stays the record.** The agent cannot execute an arbitrary
string of code — only cells that already visibly exist. To compute something
new (say, to answer a review comment) it must insert a *visible* cell and run
it, exactly as a human collaborator would. When you download the `.ipynb`, the
whole reasoning path is in it — including the review conversation, which lives
in notebook metadata rather than in a chat log that dies with the tab.

**The owner decides what the agent may touch.** Per cell and per notebook:
`write`, `read`, or `none`. `none` means *hidden* — the cell or file becomes
indistinguishable from one that does not exist (`CELL_NOT_FOUND` /
`NOTEBOOK_NOT_FOUND`, never a leakier code), across listing, focus, export,
and comment threads alike. It is human-only: no tool can read or change it,
and there are deliberately no consent prompts in the page — owner-side
lockdown is the site's job, allow-once UX belongs to the WebMCP client.

#### The idea that generated all of it

One question was applied to every feature: *could this still make sense if the
second participant were a human instead of an agent?*

A second human would never be handed a private copy — so the agent writes to
the live shared model. A second human could not silently overwrite your
unsaved edit — so writes carry a hash. A second human could not run code you
cannot see — so there is no arbitrary-execution tool. A second human would
leave comments in the document, not a private DM — so review threads live in
the `.ipynb`. A second human would be visible while working — so there is a
presence layer. A second human would point, and be pointed at — so pointing is
bidirectional. And you would decide what a second human could touch — so
access levels are owner-set and tool-invisible.

It is not an assistant with a scratch space. It is a second editor in your
document, under the rules you would give a person.

#### How WebMCP was implemented

A real JupyterLab 4.6 prebuilt frontend extension
(`packages/jupyterlite-webmcp`, built with `@jupyter/builder` + hatchling) —
no server extension, no backend, no API key, no embedded LLM, no chat panel.

Tools are registered once at plugin activation through the current imperative
API, `document.modelContext.registerTool()` — not the obsolete
`navigator.modelContext`/`provideContext`, and not the declarative
HTML-attribute form. They are never re-registered as the notebook, focus,
selection or kernel changes: those are *state* changes, not *capability*
changes, and every tool reads live state when invoked, so the tool list never
churns underneath the agent.

Notebook source, outputs and comment bodies are attacker-controllable text, so
every tool that can return them sets `untrustedContentHint: true` in its
annotations. `jupyter_run_cells` honors the runtime's `AbortSignal`, but an
abort only interrupts execution that invocation itself started — the kernel is
shared with the human, so the tool never kills work the human launched. Every
result is bounded at several layers (`src/limits.ts`, `boundJson()`) so one
call cannot drain a notebook. Errors are structured codes, not prose.

Six small plugins keep the notebook features decoupled from the tool surface:
review, access, activity, the right-sidebar Agent panel, and output-selection
capture all work with **no agent connected at all**. Only
`jupyterlite-webmcp:tools` touches WebMCP. Turn WebMCP off and nothing
user-facing disappears — the extension only *adds* a tool surface, it never
gates one.

#### Verification

361 unit tests (jest) and 46 browser integration tests (Playwright, driven
against the built static site through a WebMCP shim) run in CI on every push,
alongside ESLint, Prettier and `tsc` — all green. In Chrome 150 with WebMCP
enabled, on the live deployment, through the real `document.modelContext`, all
22 tools register, `getTools()` returns them with annotations intact, and
`executeTool()` round-trips.

Portability was verified rather than assumed: the same extension reports
`enabled OK` under a real JupyterLab 4.6 server and a real Notebook 7 server,
and `jupyter_run_cells` executed `print(2 + 2)` on a real ipykernel returning
`4` — no code changes needed to move from JupyterLite's in-browser Pyodide
kernel to a server-backed one.

The deployment is served cross-origin isolated (`COOP: same-origin`,
`COEP: credentialless`), verified `crossOriginIsolated === true` with
`SharedArrayBuffer` available, so Pyodide runs on a real `SharedArrayBuffer`
worker instead of the slower service-worker fallback. (GitHub Pages cannot set
those headers; that is why the demo is hosted on Vercel.)

And one thing this does **not** claim: WebMCP gives a page no way to wake,
summon, or notify an agent. Editing a cell, running something, or leaving a
review comment never calls anyone. It changes the live state an agent will see
the next time a human invokes it. That boundary is documented rather than
papered over.

#### Try it

Open the live demo, wait for the status bar to read `WebMCP ready`, open
`customer-analysis.ipynb`, and give your agent:

> Open customer-analysis.ipynb. The conversion rate looks wrong to me — read
> the conversion-rate cell and check its denominator against how
> eligible_sessions is defined further up. If it's wrong, fix only that
> expression, rerun the cell, and leave a review comment on the line you
> changed explaining why.

Then highlight `eligible_sessions` with your mouse and ask the agent what you
just selected.

MIT licensed. Built with Claude Opus 5 via Claude Code; independently verified
out-of-band through a black-box protocol (`CODEX_DRIVER.md`) that never reads
the source.

<!-- END DEVPOST DESCRIPTION -->

## 7. Repository URL

```text
https://github.com/alliecatowo/jupyterlite-web-mcp
```

Public, MIT licensed, described and topic-tagged. Verified reachable
unauthenticated: the repository page, `README.md`, `LICENSE`, `SUBMISSION.md`
and `CODEX_DRIVER.md` all return `200` with no credentials.

## 8. YouTube URL

```text
<FINAL YOUTUBE URL — fill in after upload>
```

Must be **public** (not unlisted — the rules say "made publicly visible on
YouTube") and **under 3:00**. Title and description are specified in `DEMO.md`.

## 9. Testing instructions (paste into Devpost "Testing instructions")

```text
No sign-in, no install, no credentials required.

1. Open https://jupyterlite-web-mcp.vercel.app/lab/index.html in ChatGPT's
   in-app browser, or in Google Chrome with WebMCP enabled.
2. The status bar at the bottom-right should read "WebMCP ready" - meaning
   this page published its 22 notebook tools, which is all a page can
   actually know. It deliberately does not claim an agent is connected;
   WebMCP gives a page no way to detect one. Once an agent does act, the
   same item reads what it is doing ("Agent - running cell 6"). If it reads
   "WebMCP unavailable", the browser does not expose document.modelContext;
   the notebook still works, but no tools are published.
3. In the file browser, double-click customer-analysis.ipynb. Wait for the
   kernel indicator to go idle (Pyodide takes a few seconds on first load).
4. Ask your agent:

   Open customer-analysis.ipynb. The conversion rate looks wrong to me — read
   the conversion-rate cell and check its denominator against how
   eligible_sessions is defined further up. If it's wrong, fix only that
   expression, rerun the cell, and leave a review comment on the line you
   changed explaining why.

   Expected: the notebook opens itself; "converted / visitors" becomes
   "converted / eligible_sessions"; the execution count increments; the
   printed conversion rate changes; a review thread appears in the Agent
   panel (right sidebar, Comments tab).

   Watch the notebook while it happens, not just the result. The targeted
   cell gets a ring and an inline badge (Reading... / Applying... /
   Running... / Done). The edited cell grows a "+-2 changed" button - click
   it for the exact before/after diff of what the agent wrote. Any output
   the agent produced is labelled "Run by Browser agent" with a timestamp;
   click that line for the tool name and duration. The status bar reads what
   the agent is doing right now ("Agent - running cell 6"), and clicking it
   lists all 22 tools and recent invocations with timings. The Agent panel's
   Activity tab is the full log.

5. Bidirectional pointing: highlight "eligible_sessions" anywhere in the
   notebook with your mouse, then ask the agent what you just selected. It
   reads the exact substring. Then ask "where is churn actually calculated?"
   and the notebook scrolls itself to that expression.

6. Concurrency: ask the agent to read a cell, then edit that same cell by
   hand without saving, then ask the agent to rewrite it. The write is
   refused with a STALE_CELL error and your edit is untouched.

7. Access control: right-click any cell -> "Agent Access" -> Hidden, then ask
   the agent to read it. The cell is reported as not existing, while you can
   still see and edit it normally. Set it back with the same menu, or from
   the Agent panel's Access tab.

8. Selection handoff: highlight text inside a rendered output (e.g. the
   region table). An "Ask about this output" chip appears; clicking it shows
   exactly what would be shared, and states plainly that it cannot contact
   an agent. Nothing on this page can wake, summon, or notify an agent - by
   design, and it says so.

Two other seeded notebooks: needs-review.ipynb (deliberate problems, good for
"review this for me") and reviewed-analysis.ipynb (a finished human+agent
session with review threads already in it).

To inspect the raw tool surface, open devtools on the live page and run:
  document.modelContext.getTools().map(t => t.name)          // 22 names
  await document.modelContext.executeTool('jupyter_get_context', {})

A full black-box verification protocol (every tool, exact arguments, expected
result, expected visible change, plus seven interaction flows) is in
CODEX_DRIVER.md in the repository.
```

## 10. Credentials

**None.** No sign-in, no accounts, no API keys, no environment variables. The
entire application runs client-side; there is nothing to authenticate to.

---

## 11. Evidence against the four judging criteria

### WebMCP Leverage (25%)

Every one of the 22 registered tools operates on state that exists **only**
inside one browser tab, with no backend an ordinary MCP server could talk to:
the live `NotebookPanel` model, including edits never saved to disk
(`jupyter_get_cells` reads `sharedModel.getSource()` directly, never
re-reading `.ipynb` bytes from a file); the browser-local, IndexedDB-backed
contents manager (`jupyter_list_workspace`, `jupyter_create_notebook`); the
human's current cell/cursor/text selection (`jupyter_get_context`'s
`focus.textSelection`, bounded but exact); the in-browser Pyodide kernel
shared with the human (`jupyter_run_cells`, `jupyter_kernel_action`); review
threads stored in notebook metadata (`jupyter_list_comments` and friends); and
the human's text selection *inside a rendered output*, captured only when it
lies wholly within one output wrapper, rejected inside rich widgets, and
fingerprinted so a later read can tell whether that output was replaced
(`jupyter_get_output_selection`). None of it is proxied through or duplicated
into an external service.

The imperative `document.modelContext.registerTool` API is used specifically
because it lets an agent already present in the tab reach directly into state
a server-based MCP integration has no way to see — an unsaved edit, an exact
mouse selection — without inventing a synchronization layer to fake it. And
the WebMCP contract is implemented with its sharp edges handled, not just its
happy path: `AbortSignal` honored with scoped semantics, `untrustedContentHint`
on every content-returning tool, bounded results on both the text and
`structuredContent` copies, structured error codes, registration-failure
surfacing, and a tool list that never churns.

**Where to look:** `src/webmcp/register.ts`, `src/webmcp/results.ts`,
`src/limits.ts`, `docs/webmcp-compatibility.md`, `docs/webmcp-tools.md`.

### Execution (25%)

A real JupyterLab 4.6 extension (`packages/jupyterlite-webmcp`, built with
`@jupyter/builder`/hatchling like any other prebuilt lab extension) running
against a real Pyodide/WebWorker kernel with real, unmodified cell outputs —
no mocked or simulated execution path anywhere.

Concurrency is handled deliberately: `jupyter_update_cell` /
`jupyter_delete_cell` require an `expectedSourceHash` from a prior read and
refuse a stale write with a structured `STALE_CELL` error rather than
clobbering a human's concurrent edit (`src/jupyter/cells.ts`).
`jupyter_run_cells` honors an `AbortSignal`, interrupting only execution that
invocation itself started, since the kernel is shared with the human
(`src/jupyter/execution.ts`). Every tool result is bounded at several layers
(`src/limits.ts`, `boundJson` in `src/webmcp/results.ts`).

One detail stands for the whole approach. The status bar does **not** say
"Agent connected", because a page cannot know that: WebMCP gives it no way to
detect an agent's presence. It says `WebMCP ready` — a claim about the page,
which is the only thing the page can verify — and only ever names an agent
when one demonstrably acted (`Agent · running cell 6`). There is a unit test
asserting that no idle or unavailable string may contain the word "agent".

The human-agent experience is finished, not stubbed. The presence layer
(`src/activity/markers.ts`, `src/ui/status.ts`) renders a targeted-cell halo,
a decaying per-kind activity tint, an inline `Reading…`/`Applying…`/
`Running…`/`Done`/`Failed` badge with a click-through failure popover carrying
the structured error code and duration, a `±N changed` toggle opening a real
LCS line diff of what the agent wrote, an output-provenance line naming the
agent and time, and a live status phrase (`Agent · running cell 6`) that
distinguishes a genuinely in-flight call from a recently-completed one and
says so honestly in code. It is built to be unobtrusive and safe: every marker
uses `box-shadow: inset`/`outline` so it can never shift layout,
`prefers-reduced-motion` is honored, and the entire layer swallows its own
errors and no-ops on disposed targets, so presentation can never affect a tool
result.

The deployment is served cross-origin isolated (`COOP: same-origin`,
`COEP: credentialless`) — verified `crossOriginIsolated === true` with
`SharedArrayBuffer` available — so the Pyodide kernel runs on a real
`SharedArrayBuffer` worker instead of the slower service-worker fallback;
GitHub Pages cannot set the required headers, which is why the demo is hosted
on Vercel instead. The exact deployed artifact is reproducible with one
command (`PYTHON=… ./scripts/build-site.sh`).

**361 unit tests** (jest, 24 suites) and **46 browser integration tests**
(Playwright, against the built static site) run in CI
(`.github/workflows/test.yml`) alongside ESLint, Prettier and `tsc` — all
green on `main`. In Chrome 150 with WebMCP enabled, driven through the real
`document.modelContext`, all 22 tools register, `getTools()` returns them with
annotations intact, and `executeTool()` round-trips end to end.

Verification was also deliberately taken out-of-band: `CODEX_DRIVER.md` is a
black-box protocol for an independent agent to drive the *deployed* site
through its real tool surface, per tool and per flow, without reading the
repository — so the claims here are checkable against observable behavior.

### Potential Impact (25%)

Any existing JupyterLab, Notebook 7, or JupyterLite deployment can add this
extension with no architectural change: a normal frontend plugin, no server
component, no additional infrastructure, no AI vendor dependency of its own,
one line in `requirements.txt`.

Verified directly rather than claimed: `jupyter labextension list` reports it
enabled in a real JupyterLab 4.6 server and a real Notebook 7 server; a full
open → read → update → context round trip succeeds in both; and
`jupyter_run_cells` executed `print(2 + 2)` on a real ipykernel returning `4`
with `executionCount: 1` — no code changes were needed to move from
JupyterLite's in-browser Pyodide kernel to a server-backed ipykernel
(`docs/install.md`).

Jupyter's installed base — JupyterLab, Notebook 7, and every JupyterLite site,
including every teaching site and "runs in your browser, no install" tutorial
— is the addressable audience. The extension does not embed, call, or depend
on any specific LLM provider; whatever browser agent happens to be present is
the one that gets access. Removing WebMCP support from the browser removes no
user-facing capability of the notebook, the Review feature, or the access
controls; it only removes the extra tool surface.

There is a second-order impact result worth stating: because the extension
writes to the notebook's *shared* model rather than a private copy, putting it
behind Jupyter's own `jupyter-collaboration` server extension makes the
agent's edits reach every other connected human live, with no integration
code — and the `STALE_CELL` guard turns out to protect a *remote* human's
unsaved edit for exactly the same reason it protects a local one. That was
measured with two clients against a real server, not assumed
(`docs/multiplayer.md`).

### Creativity & Ambition (25%)

The whole system is generated by one constraint, applied to every feature:
*could this still make sense if the second participant were a human instead of
an agent?* That is what makes it a coherent product rather than a pile of
tools — and it is falsifiable, because you can read each answer off the code:
no private copy (shared model), no silent clobber (`STALE_CELL`), no invisible
execution (no arbitrary-exec tool), comments in the document not a DM
(`.ipynb` metadata), visible while working (the presence layer), pointing both
ways (`focus.textSelection` in, `jupyter_focus_cell` out), and owner-set
limits (access levels no tool can read or change).

The product framing is deliberately narrow and load-bearing: the browser agent
is not a separate notebook assistant with its own scratch space — it is
another participant reading and writing the *same* notebook model the human is
looking at, under the same concurrency rules a second human editor would be.

The review conversation is a first-class part of this. An agent can create,
reply to, resolve and reopen threads anchored to a cell, an exact range of
source text, or an output, and that conversation is stored in the `.ipynb`
file's own metadata (`jupyterlite_webmcp_review`), so it travels with the
notebook when downloaded — not a chat log that evaporates when the tab closes.

The product-boundary test applied throughout development — *"could this
feature still make sense if the second participant were a human instead of an
agent?"* — is why there is no hidden kernel-introspection tool: to answer a
review comment, the agent inserts and runs a visible cell, exactly as a human
collaborator would, so the notebook stays the complete computational record of
how a conclusion was reached. The same logic makes pointing bidirectional
(`jupyter_focus_cell`, `jupyter_focus_comment`, `focus.textSelection`).

The same boundary test produced the access model: publisher-side lockdown, not
per-call consent. The owner declares per cell and per notebook what the agent
may do (`write`/`read`/`none`) from ordinary notebook surfaces — the cell
context menu, the file-browser context menu, the Agent panel's Access tab —
all of which work with no agent connected, none of which any tool can change,
with hidden cells and notebooks indistinguishable from nonexistent ones and
read-only violations reported as `CELL_ACCESS_DENIED` /
`NOTEBOOK_ACCESS_DENIED`. There are no allow-once/allow-always prompts
anywhere in the page: that permissioning UX belongs to the WebMCP client
(decision note in `docs/agent-collaboration-roadmap.md`).

The same discipline sets the boundary of what shipped. Agent access is
`write`/`read`/`none`, and a write call on a `read` cell is refused outright
rather than degrading into a pending suggestion. A fourth `propose` level —
where a write lands as a staged edit the human accepts or rejects — is the
obvious next step, and the diff rendering it would need already exists; the
staging semantics under the read-hash-write contract do not, and were not
faked. That is stated in the README rather than left for a judge to discover.

Ambition also shows in what was refused. Real-time collaboration on the hosted
demo was investigated and deliberately not shipped, because the only
Lite-compatible WebRTC document provider is unmaintained and static hosting
has no signaling endpoint — so the demo stays honestly single-user and the
gap is documented instead of faked (`docs/multiplayer.md`). Likewise, the
platform boundary that WebMCP cannot wake, summon or notify an agent is stated
plainly in the README, the docs, and the demo narration rather than glossed.

### Positioning note (for whoever writes the copy)

Do **not** pitch this as "AI-powered Jupyter notebooks."
Pitch it as **"a portable semantic interface to a browser-native computational
workspace."**

Core thesis: *JupyterLite brought the computational notebook into the browser.
WebMCP makes that live workspace semantically accessible to the agent already
accompanying the user.*

---

## 12. Challenge-development provenance

- Built solo by **Allison Coleman** for the WebMCP Challenge, 2026-08-25 →
  2026-09-03. All work is original to the challenge window; the first commit
  is dated within the submission period.
- The extension, tests and documentation were written in collaboration with
  **Claude Opus 5** via **Claude Code**. Every commit carries a
  `Co-Authored-By: Claude Opus 5 (1M context)` trailer, so the provenance is
  auditable from `git log` rather than asserted.
- Design decisions, architecture, product boundaries and all review judgments
  are the author's.
- Verification was deliberately kept out-of-band: `CODEX_DRIVER.md` is a
  black-box protocol written to be handed to an *independent* agent with a
  WebMCP-capable browser, which drives the deployed site through its real
  `document.modelContext` surface and files a pass/fail report **without
  reading the repository source**. The dated audit result is in
  `docs/audit-verdict.md`.
- Third-party provenance is fully disclosed in `NOTICE.md`: the JupyterLite
  deployment substrate derives from `jupyterlite/demo`; `jupyterlab-ai-commands`
  and `jupyterlab-commenting` were *studied* as implementation references and
  are neither runtime dependencies nor sources of copied code.

---

## 13. Final submitted commit SHA

```text
<FILL IN — output of `git rev-parse HEAD` on main at the moment of submission,
after the repo is public and the deployed build matches it>
```

Invariant to check before filling this in: the deployed bundle hash under
`https://jupyterlite-web-mcp.vercel.app/extensions/jupyterlite-webmcp/static/`
must match the locally built `dist/` for that SHA.

Last verified match: local `dist/` built from `8955801`; the live
`jupyter-lite.json` loads `remoteEntry.700c044df2408ad1.js`, identical to the
local build's content-hashed filename, and the deployed chunks carry the
current status strings and the Comments-composer styles. The live
`customer-analysis.ipynb` serves nine cells, with no ipywidgets anywhere in
the deployment.

---

## 14. Exact values for the Devpost form fields

| Devpost field | Exact value |
| --- | --- |
| Project name | `JupyterLite WebMCP` |
| Tagline | `Your notebook is already in the browser — now your agent can be too. 22 WebMCP tools over the live JupyterLite notebook: unsaved edits, your mouse selection, the shared kernel, and threaded review.` |
| About the project | §6 above, between the `DEVPOST DESCRIPTION` markers |
| Built with | `webmcp`, `document.modelcontext`, `jupyterlab`, `jupyterlite`, `pyodide`, `typescript`, `react`, `webassembly`, `python`, `vercel`, `playwright`, `jest` |
| Try it out (live) | `https://jupyterlite-web-mcp.vercel.app/lab/index.html` |
| Try it out (repo) | `https://github.com/alliecatowo/jupyterlite-web-mcp` |
| Video demo link | §8 above |
| Testing instructions | §9 above |
| Credentials | None required — state "No sign-in or credentials needed; everything runs client-side." |
| Thumbnail / gallery image | See `DEMO.md` § thumbnail |

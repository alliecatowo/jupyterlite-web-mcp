# DEMO.md — video production playbook

Everything needed to record and cut the submission video mechanically. Follow
it top to bottom; no creative decisions are left open.

---

## 0. Targets and constraints

| Target | Value |
| --- | --- |
| Hard rule (official) | **strictly less than 3:00**, uploaded to YouTube, **publicly visible**, with **audio** covering what was built and how WebMCP was used |
| Target runtime | **2:50** (10s of headroom) |
| Target narration | **405 words** at ~155 wpm (≈2:36 of speech + ≈9s of title cards) |
| Aspect / resolution | 16:9, record at 1920×1080, export 1080p30 |
| Audio | Single voice, no music (music risks a third-party-material violation and buries the required audio content) |
| Screen capture | Chrome window only, not the whole desktop. Hide bookmarks bar, hide other tabs. |
| Browser zoom | **125%** — JupyterLab's default type is too small to read at 1080p |
| Clips | 7 independently recordable units (§3). Record each 2–3 times, keep the best; do not attempt one continuous take. |

**The narration must carry the information by itself.** On-screen text is a
reinforcement, never the only place a required fact appears. Every required
item — what was built, the problem, why WebMCP, how WebMCP was implemented —
is spoken in §3 and repeated verbatim in §7.

---

## 1. Exact starting application state

Do this once before recording, and re-establish it between clips per §4.

1. Chrome with WebMCP enabled (or ChatGPT's in-app browser), agent side panel
   open and idle, on a clean profile with no extensions that draw UI.
2. Navigate to `https://jupyterlite-web-mcp.vercel.app/lab/index.html`.
3. **Wait for the status bar (bottom-right) to read `WebMCP ready`.** If it
   reads `WebMCP unavailable`, stop — the browser does not expose
   `document.modelContext` and there is no demo to record.
4. Close every open tab inside JupyterLab. The launcher should be showing.
5. The file browser (left sidebar) shows `customer-analysis.ipynb`,
   `needs-review.ipynb`, `reviewed-analysis.ipynb`, `scratch.ipynb`, `data/`.
6. `customer-analysis.ipynb` must be **pristine** — the `conversion-rate` cell
   must read `conversion_rate = converted / visitors`, and there must be **no
   review threads** in the Agent panel's Comments tab.
7. Right sidebar: the **Agent** panel is available but **collapsed**. Scene F
   opens it on camera; that reveal is the point.
8. All cell access levels are `write` (no cell shows an "Agent access" badge).
9. Window: 1920×1080, browser zoom 125%, bookmarks bar hidden.

**Cells referenced below**, by their stable ids in
`content/customer-analysis.ipynb`: `intro-md`, `load-data`, `funnel-def`,
`filter-md`, `working-filter`, `conversion-rate`, `by-region-md`,
`region-table`, `region-chart`, `widget-md`, `spend-widget`.

---

## 2. Title cards

Five cards. White text, `#0b0b0d` background, system sans, generous letter
spacing. **0.8s each** (T1 and T5 excepted), hard cut in and out, no animation. Every
card is counted inside its clip's runtime below.

| Card | Exact text (line breaks as shown) | Placement |
| --- | --- | --- |
| **T1** (open) | `JupyterLite WebMCP`<br>`Your notebook is already in the browser.`<br>`Now your agent can be too.` | 0:00–0:02.5 (2.5s, the one long card) |
| **T2** | `The human points.` | start of Clip 3 |
| **T3** | `The human wins.` | start of Clip 4 |
| **T4** | `The agent points back.` | start of Clip 5 |
| **T5** (close) | `JupyterLite WebMCP`<br>`22 WebMCP tools · MIT · no server, no API key`<br>`jupyterlite-web-mcp.vercel.app` | 2:46–2:50 (4.0s hold) |

---

## 3. Timestamped storyboard

Legend — **DO:** what the hands do. **SAY:** exact voiceover. **TOOLS:** the
WebMCP calls that should appear in the agent's transcript. **SEE:** what must
be visible on screen. **CUT:** editing instruction. **WHY:** why the shot
exists (do not cut a shot without reading this).

---

### Clip 1 — "This is an ordinary notebook" · 0:00–0:18 (18s)

**WHY:** Establishes there is no AI product on the page. Everything later is
more impressive because the baseline is boring. Also front-loads *what was
built* and *the problem*, which the rules require in audio.

- **CUT:** T1 title card, 0:00–0:02.5. Hard cut to screen.
- **DO:** Show the JupyterLite launcher. Slowly move the cursor across the
  page — left file browser, top menu bar, bottom status bar — then rest it on
  the status bar reading `WebMCP ready`.
- **SEE:** No chat panel. No model picker. No "Ask AI" button. Status bar
  (**bottom right**): `WebMCP ready`.
- **CUT:** At 0:12, a 1.5s zoom-in to 200% on the bottom-right status bar,
  hold 2s, zoom back out.

> **SAY (39 words):**
> "I built a JupyterLab extension that hands your live notebook to a browser
> agent over WebMCP. This is ordinary JupyterLite — notebooks, files and the
> Python kernel all run in this tab. No chat panel, no model picker, no
> server."

---

### Clip 2 — The agent opens the notebook · 0:18–0:40 (22s)

**WHY:** First tool call, and the moment to state *why WebMCP specifically*.
The notebook visibly opening proves there is no shadow copy.

- **DO:** Type into the agent: `Open the customer analysis notebook.`
- **TOOLS:** `jupyter_list_workspace` → `jupyter_open_notebook`
- **SEE:** The notebook tab opens by itself and comes to the front. Kernel
  indicator goes idle.
- **DO:** Scroll the notebook top to bottom once, slowly, then back to the top.
- **CUT:** No cuts. This shot needs to read as continuous and unfaked.

> **SAY (54 words):**
> "The problem is that almost nothing about a working notebook exists on disk.
> The cell you haven't saved. The text you just highlighted. The kernel holding
> your data. A server-side integration reads the file, which doesn't match your
> screen — and on JupyterLite there is no server at all. WebMCP is the only way
> in."

---

### Clip 3 — The human points, the agent fixes exactly that · 0:40–1:12 (32s)

**WHY:** The single strongest shot in the video. A mouse selection is state
that exists nowhere except this tab, and the agent acts on precisely it. If
only one clip survives, it is this one.

- **CUT:** T2 title card, 0.8s.
- **DO:** Click into the `conversion-rate` cell. With the mouse, select
  **only** the substring `converted / visitors` inside
  `conversion_rate = converted / visitors`. Leave it highlighted.
- **CUT:** Zoom to 200% on that line while the selection is made; hold through
  the next beat.
- **DO:** Ask the agent: `This looks wrong. Fix just what I selected and rerun
  that cell.`
- **TOOLS:** `jupyter_get_context` (returns `focus.textSelection`) →
  `jupyter_get_cells` (returns `sourceHash`) → `jupyter_update_cell` (carries
  `expectedSourceHash`) → `jupyter_run_cells`
- **SEE, in this order — do not cut any of it:**
  1. The cell gains a **ring** and its left edge tints.
  2. An inline badge under the cell input reads `Applying…`, then `Done`.
  3. The source changes to `converted / eligible_sessions`.
  4. A **`±2 changed`** button appears next to the badge.
  5. The execution count increments and the printed conversion rate changes.
  6. The status bar (bottom right) reads `Agent · updating cell 6`, then
     `Agent · running cell 6`.
- **DO:** Click the **`±2 changed`** button. A popover opens headed "What the
  agent changed", showing the `-`/`+` line diff.
- **CUT:** Hold on the open diff popover for 2s, then zoom back out.
  **Candidate thumbnail frame** (see §9).

> **SAY (77 words):**
> "So I point with my own cursor — I select exactly the expression that looks
> wrong. The agent reads my selection, not my whole file. It reads the cell's
> current source and its hash, replaces only what I highlighted, then runs the
> cell as a separate, explicit step. And I can watch the whole thing: the cell
> rings, the badge says applying, and a plus-two-changed button opens the exact
> diff of what it wrote. No chat transcript required."

---

### Clip 4 — The human edits by hand, and wins · 1:12–1:38 (26s)

**WHY:** Proves the agent is on the live model and that concurrency is real,
not asserted. `STALE_CELL` on camera is the credibility beat of the video.

- **CUT:** T3 title card, 0.8s.
- **DO:** Click into `working-filter` and edit it by hand to:
  ```python
  working = df[
      (df["plan"] != "free") &
      (df["region"] == "West")
  ].copy()
  ```
  Run it with Shift+Enter. **Do not save.**
- **DO:** Ask the agent: `Keep my filter exactly as it is. Add a comparison to
  the overall paid-customer baseline underneath the chart.`
- **TOOLS:** `jupyter_get_cells` (re-read, picks up the unsaved edit) →
  `jupyter_insert_cell` → `jupyter_run_cells`
- **SEE:** The `West` filter is byte-for-byte untouched. A new, **visible**
  cell appears below `region-chart`, rings, badges `Running…` → `Done`, and
  its output carries a `Run by Browser agent · HH:MM:SS` line.
- **DO:** Click that provenance line — a popover names the tool and its
  duration in milliseconds.
- **CUT:** Split-screen is not needed; a single 150% zoom that pans from
  `working-filter` down to the new cell reads better.

> **SAY (65 words):**
> "Now I change the filter by hand and run it, without saving. The notebook is
> in a state the agent hasn't seen. It rereads the live model — my unsaved edit
> included — and adds a *visible* cell underneath, because it can't run
> arbitrary code. Every agent write carries a hash from what it read. If I'd
> changed that cell first, the write is refused, not merged."

---

### Clip 5 — The agent points back · 1:38–1:56 (18s)

**WHY:** Pointing is bidirectional. Cheap to shoot, and it lands the
"collaborator, not assistant" framing.

- **CUT:** T4 title card, 0.8s.
- **DO:** Ask the agent: `Where is churn actually calculated?`
- **TOOLS:** `jupyter_get_cells` → `jupyter_focus_cell`
- **SEE:** The notebook **scrolls itself** to `region-table` and the editor
  selection lands on `churn_rate=("churned", "mean")`.
- **CUT:** Do not zoom during the scroll — the movement is the shot. Zoom to
  175% only after it lands, hold 2s.

> **SAY (37 words):**
> "And the pointing goes the other way. I ask where churn is calculated, and
> the agent scrolls my notebook and selects the expression itself. Two
> participants pointing at things, the way two people at one keyboard would."

---

### Clip 6 — Review lives in the notebook · 1:56–2:24 (28s)

**WHY:** Shows the feature that is not an AI feature, the honesty beat about
WebMCP not being able to wake an agent, and that the conversation survives in
the `.ipynb`.

- **DO:** Select `converted / eligible_sessions` in `conversion-rate`,
  right-click → **Add Comment**, type: `Are we sure this denominator is right?`
  and submit.
- **DO:** Open the right sidebar **Agent** panel → **Comments** tab. The thread
  is there.
- **DO:** Ask the agent: `Go through my unresolved comments and answer them.
  Don't change my existing cells.`
- **TOOLS:** `jupyter_list_comments` → `jupyter_get_comment` →
  `jupyter_reply_comment`
- **SEE:** The agent's reply appears in the same thread, next to the human's
  message, in the same panel.
- **CUT:** Cut on the reply appearing. Then a 1.5s beat on the panel, no zoom.

> **SAY (71 words):**
> "Review is an ordinary notebook feature, not an AI feature. I comment on my
> own code by hand. And here's the honest part: leaving that comment calls
> nobody. WebMCP gives a page no way to wake or notify an agent — it just
> changes the state the agent sees next time I ask. When it answers, we're in
> one thread, stored in the notebook's own metadata, so it travels with the
> file."

---

### Clip 7 — The owner decides, and how it's built · 2:24–2:50 (26s)

**WHY:** Access control is the differentiator, and this is where the *how it
was implemented* audio requirement is satisfied. Never cut this clip.

- **DO:** Right-click the `conversion-rate` cell → **Agent Access** → cycle to
  **Hidden**.
- **DO:** Ask the agent: `Read the conversion rate cell.`
- **TOOLS:** `jupyter_get_cells` → structured `CELL_NOT_FOUND`
- **SEE:** The agent reports the cell does not exist, and the cell shows a
  `Failed` badge. Click the badge — the popover names the structured error
  code (`CELL_NOT_FOUND`) and the duration.
- **DO:** **Immediately click into that same cell yourself and type a
  character** to prove you were never locked out, then undo.
- **DO:** Set it back to **Editable** from the Agent panel's **Access** tab.
- **CUT:** At 2:46, hard cut to T5 title card, hold 4s to the end.

> **SAY (62 words):**
> "And I decide what the agent may touch, per cell. Hidden means the cell is
> indistinguishable from one that doesn't exist — but it never restricts me.
> Under the hood, this is one JupyterLab extension registering twenty-two tools
> once, through document dot modelContext dot registerTool. No server, no API
> key, no model of its own. Turn WebMCP off and the notebook still works."

---

## 4. Reset instructions between clips

The workspace is IndexedDB-backed in the browser, so edits persist across
reloads. Reset **before every take**, not just between clips.

**Fast reset (covers Clips 2–5, 7):**

1. Do **not** save the notebook (`Ctrl/Cmd+S`) at any point during recording.
2. Close the notebook tab → choose **Discard** when asked about unsaved
   changes.
3. Reload the page (`Ctrl/Cmd+Shift+R`).
4. Confirm `conversion-rate` reads `converted / visitors` again.

**Full reset (required after Clip 6, and after any accidental save):**
review threads are written into notebook metadata and *will* persist.

1. In the file browser, right-click `customer-analysis.ipynb` → **Delete**.
2. Reload the page. JupyterLite re-seeds the pristine copy that ships with the
   site.
3. Confirm: `converted / visitors` is back, and the Agent panel's Comments tab
   is empty.

**Nuclear reset (if anything looks stale):** devtools → Application → Storage →
**Clear site data** → reload. Costs one Pyodide kernel warm-up (~10s).

**Per-clip reset requirement:**

| Clip | Reset needed before recording |
| --- | --- |
| 1 | Fast — plus close all JupyterLab tabs so the launcher shows |
| 2 | Fast |
| 3 | Fast |
| 4 | Fast (Clip 3's fix must **not** be present; Clip 4 is shot independently) |
| 5 | Fast |
| 6 | **Full** — Comments tab must start empty |
| 7 | **Full** — no leftover comments, all cells back to `write` |

**Continuity note:** Clips 3 and 4 are shot independently and cut together, so
Clip 4's `conversion-rate` cell may read `converted / visitors` while Clip 3
ended on `converted / eligible_sessions`. Clip 4's zoom never shows the
`conversion-rate` cell — keep the frame on `working-filter` and below. If you
prefer strict continuity, shoot 3 and 4 as one take and cut T3 in over the
transition.

---

## 5. Recording order and coverage

Shoot in this order — it minimizes resets and gets the risky shot early while
the agent is behaving:

1. **Clip 3** (highest risk, highest value — get it in the can first)
2. **Clip 4**
3. **Clip 7**
4. **Clip 6**
5. **Clip 5**
6. **Clip 2**
7. **Clip 1** (no agent interaction; can be shot any time)

**B-roll to grab while you're set up** (insurance for a shot that won't
cooperate): the open `±N changed` diff popover; the `Failed` badge popover
with its error code; the status bar mid-phrase (`Agent · running cell 6`); the
Agent panel's Activity tab listing the calls; the Access tab with the
per-notebook dropdown open;
the status bar reading `WebMCP unavailable` in a non-WebMCP browser (proves
graceful degradation); a `STALE_CELL` error in the agent transcript.

---

## 6. If something goes wrong on camera

| Symptom | What it is | What to do |
| --- | --- | --- |
| `STALE_CELL` when you didn't expect it | The concurrency guard working | **Keep the take.** Say "that's the guard — the agent has to reread." It is a better shot than the clean one. |
| Agent doesn't see a manual edit | The read happened before the edit | Re-ask; the live model only reflects state as of each call |
| `KERNEL_UNAVAILABLE` | Pyodide still starting | Wait for the kernel indicator to go idle, reshoot |
| Status bar: `WebMCP unavailable` | Browser doesn't expose `document.modelContext` | Stop. Switch browsers. There is no demo without this. |
| A comment thread shows as orphaned | Anchored text was edited elsewhere; expected behavior | Full reset, pick an untouched selection |
| Agent narrates its tool calls verbosely | Fine | Don't fight it — the tool names on screen are evidence |
| Agent refuses or wanders | Prompt drift | Use the prompts in §3 **verbatim**; they are tuned to these tools |

---

## 7. Full uninterrupted narration script

Record this straight through as a scratch track for timing, then re-record per
clip. **405 words** — about 2:36 at 155 wpm.

> I built a JupyterLab extension that hands your live notebook to a browser
> agent over WebMCP. This is ordinary JupyterLite — notebooks, files and the
> Python kernel all run in this tab. No chat panel, no model picker, no
> server.
>
> The problem is that almost nothing about a working notebook exists on disk.
> The cell you haven't saved. The text you just highlighted. The kernel
> holding your data. A server-side integration reads the file, which doesn't
> match your screen — and on JupyterLite there is no server at all. WebMCP is
> the only way in.
>
> So I point with my own cursor — I select exactly the expression that looks
> wrong. The agent reads my selection, not my whole file. It reads the cell's
> current source and its hash, replaces only what I highlighted, then runs the
> cell as a separate, explicit step. And I can watch the whole thing: the cell
> rings, the badge says applying, and a plus-two-changed button opens the
> exact diff of what it wrote. No chat transcript required.
>
> Now I change the filter by hand and run it, without saving. The notebook is
> in a state the agent hasn't seen. It rereads the live model — my unsaved
> edit included — and adds a *visible* cell underneath, because it can't run
> arbitrary code. Every agent write carries a hash from what it read. If I'd
> changed that cell first, the write is refused, not merged.
>
> And the pointing goes the other way. I ask where churn is calculated, and
> the agent scrolls my notebook and selects the expression itself. Two
> participants pointing at things, the way two people at one keyboard would.
>
> Review is an ordinary notebook feature, not an AI feature. I comment on my
> own code by hand. And here's the honest part: leaving that comment calls
> nobody. WebMCP gives a page no way to wake or notify an agent — it just
> changes the state the agent sees next time I ask. When it answers, we're in
> one thread, stored in the notebook's own metadata, so it travels with the
> file.
>
> And I decide what the agent may touch, per cell. Hidden means the cell is
> indistinguishable from one that doesn't exist — but it never restricts me.
> Under the hood, this is one JupyterLab extension registering twenty-two
> tools once, through document dot modelContext dot registerTool. No server,
> no API key, no model of its own. Turn WebMCP off and the notebook still
> works.

**Required-content check** — every rules-mandated item is in the audio above:

| Required in audio | Where |
| --- | --- |
| What was built | Paragraph 1, sentence 1; restated in paragraph 7 |
| The problem / use case | Paragraph 2 |
| Why WebMCP matters | Paragraph 2, final sentence; paragraph 3 |
| How WebMCP was implemented | Paragraph 7 (`document.modelContext.registerTool`, 22 tools, one extension, no server/API key, degrades cleanly) |
| Clear demo of it functioning | Clips 2–7, all real tool calls against the live deployment |
| Human-agent experience quality | Paragraph 3 (the presence layer, spoken) and Clips 3, 4, 7 (badges, `±N changed` diff, output provenance, failure popover, live status) |

---

## 8. YouTube

**Title** (78 chars):

```text
JupyterLite WebMCP — an agent inside the notebook you already have open
```

**Description** (paste verbatim):

```text
A JupyterLab extension that exposes the live, in-browser notebook to a
compatible browser agent through WebMCP (document.modelContext.registerTool).
22 tools, no server, no API key, no embedded LLM.

Almost nothing about a working notebook exists on disk: the cell you haven't
saved, the text you just highlighted, the kernel holding your data. A
server-side MCP integration reads the file — which doesn't match your screen —
and on JupyterLite there is no server at all. WebMCP is the only way in.

In this demo:
0:00  Ordinary JupyterLite — no chat panel, no model picker
0:18  The agent opens the notebook itself
0:40  I highlight an expression with my mouse; the agent fixes exactly that
1:12  I edit a cell by hand — the agent rereads and my edit wins
1:38  The agent scrolls my notebook to point back at code
1:56  Threaded review, stored in the notebook's own metadata
2:24  Per-cell access control: hidden means "does not exist"

Live demo: https://jupyterlite-web-mcp.vercel.app/lab/index.html
Source (MIT): https://github.com/alliecatowo/jupyterlite-web-mcp

Built for the OpenAI WebMCP Challenge, 2026.

#WebMCP #Jupyter #JupyterLite #MCP #AIagents #OpenSource
```

**Upload settings:** Visibility **Public** (the rules say "publicly visible" —
unlisted does not satisfy this). Category: Science & Technology. "Altered or
synthetic content" disclosure: **No**. Made for kids: **No**. Add the chapter
timestamps above so the description renders chapters.

---

## 9. Thumbnail

**Screenshot to use (primary):** the exact frame from **Clip 3** where
`converted / visitors` is highlighted blue by the mouse selection in the
`conversion-rate` cell, with the agent panel visible on the right mid-reply.
Crop to the notebook cell + a slice of the agent panel; zoom so the selected
expression is legible at 320px wide. This one shows the *human act*, which is
the hook.

**Alternate:** the frame later in Clip 3 with the `±2 changed` diff popover
open over the cell, red `-` line above green `+` line. Use this if the
selection highlight does not survive compression — it reads at small sizes and
shows the mechanism instead of the gesture.

**Overlay copy** (two lines, left-aligned over the lower third, white on a
50%-opacity `#0b0b0d` bar):

```text
I select the code.
The agent fixes exactly that.
```

Do not put the project name on the thumbnail — the title carries it, and the
highlighted selection is the image that makes someone click.

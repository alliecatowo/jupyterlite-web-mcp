# DEMO.md — 2:50 shooting script

Record 1920×1080, browser zoom 125%, Chrome window only, one voice, no music.
Seven clips, shot separately. Everything in **TYPE** goes into the ChatGPT
desktop app verbatim.

---

## Setup (once, and re-check before every take)

1. ChatGPT desktop app open beside Chrome, agent idle.
2. Chrome on `https://jupyterlite-web-mcp.vercel.app/lab/index.html`.
3. Status bar bottom-right reads **`WebMCP ready`**. If it reads
   `WebMCP unavailable`, stop — switch browsers.
4. All JupyterLab tabs closed (launcher showing). Right sidebar Agent panel
   collapsed. All cells at `write` access. No review threads.
5. `conversion-rate` cell reads `conversion_rate = converted / visitors`.

**Reset between takes:** close the notebook tab → **Discard** → hard reload →
confirm `converted / visitors` is back. **Never press Ctrl/Cmd+S.**
After Clip 6 or 7, do a full reset instead: delete `customer-analysis.ipynb`
in the file browser, reload (JupyterLite re-seeds it), confirm Comments is empty.

**Off-camera kernel prep** (run the cells, don't save):
- Before Clip 3: run `load-data`, `funnel-def`, `working-filter`.
- Before Clip 4: run `load-data`, `working-filter`, `region-table`, `region-chart`.

**Shooting order:** 3, 4, 7, 6, 5, 2, 1.

---

## Title cards

White text on `#0b0b0d`, hard cut, no animation.

| Card | Text | When |
| --- | --- | --- |
| T1 | `JupyterLite WebMCP` / `Your notebook is already in the browser.` / `Now your agent can be too.` | 0:00–0:02.5 |
| T2 | `The human points.` | start of Clip 3, 0.8s |
| T3 | `The human wins.` | start of Clip 4, 0.8s |
| T4 | `The agent points back.` | start of Clip 5, 0.8s |
| T5 | `JupyterLite WebMCP` / `22 WebMCP tools · MIT · no server, no API key` / `jupyterlite-web-mcp.vercel.app` | 2:46–2:50 |

---

## Clip 1 — 0:00–0:18

**DO:** T1 card, then the launcher. Drift the cursor across file browser, menu
bar, status bar; rest on `WebMCP ready`. At 0:12 zoom 200% on the status bar,
hold 2s, zoom out.

> **SAY:** "I built a JupyterLab extension that hands your live notebook to a
> browser agent over WebMCP. This is ordinary JupyterLite — notebooks, files
> and the Python kernel all run in this tab. No chat panel, no model picker,
> no server."

---

## Clip 2 — 0:18–0:40

**TYPE:**

```text
Open the customer analysis notebook.
```

**DO:** Let the notebook open itself. Then scroll it top to bottom slowly and
back up. No cuts.

**WATCH FOR:** `jupyter_list_workspace` → `jupyter_open_notebook`.

> **SAY:** "The problem is that almost nothing about a working notebook exists
> on disk. The cell you haven't saved. The text you just highlighted. The
> kernel holding your data. A server-side integration reads the file, which
> doesn't match your screen — and on JupyterLite there is no server at all.
> WebMCP is the only way in."

---

## Clip 3 — 0:40–1:12

**DO:** T2 card. Click into `conversion-rate`. With the mouse, select **only**
`converted / visitors`. Leave it highlighted. Zoom 200% on that line.

**TYPE:**

```text
This looks wrong. Fix just what I selected and rerun that cell.
```

**WATCH FOR, in order — do not cut any of it:** the cell rings and its left
edge tints → badge `Applying…` → `Done` → source becomes
`converted / eligible_sessions` → a **`±2 changed`** button appears →
execution count increments and the printed rate changes → status bar reads
`Agent · updating cell 6`, then `Agent · running cell 6`.

**DO:** Click **`±2 changed`**. Hold 2s on the open diff popover, zoom out.
(Thumbnail frame.)

> **SAY:** "So I point with my own cursor — I select exactly the expression
> that looks wrong. The agent reads my selection, not my whole file. It reads
> the cell's current source and its hash, replaces only what I highlighted,
> then runs the cell as a separate, explicit step. And I can watch the whole
> thing: the cell rings, the badge says applying, and a plus-two-changed
> button opens the exact diff of what it wrote. No chat transcript required."

---

## Clip 4 — 1:12–1:38

**DO:** T3 card. Edit `working-filter` by hand to:

```python
working = df[
    (df["plan"] != "free") &
    (df["region"] == "West")
].copy()
```

Run it with Shift+Enter. **Do not save.**

**TYPE:**

```text
Keep my filter exactly as it is. Add a comparison to the overall paid-customer baseline underneath the chart.
```

**WATCH FOR:** the `West` filter untouched; a new visible cell below
`region-chart` that rings, badges `Running…` → `Done`, and whose output
carries `Run by Browser agent · HH:MM:SS`.

**DO:** Click that provenance line to open the popover naming the tool and its
duration. Keep the frame on `working-filter` and below — one 150% zoom panning
down to the new cell.

> **SAY:** "Now I change the filter by hand and run it, without saving. The
> notebook is in a state the agent hasn't seen. It rereads the live model — my
> unsaved edit included — and adds a *visible* cell underneath, because it
> can't run arbitrary code. Every agent write carries a hash from what it
> read. If I'd changed that cell first, the write is refused, not merged."

---

## Clip 5 — 1:38–1:56

**DO:** T4 card.

**TYPE:**

```text
Where is churn actually calculated?
```

**WATCH FOR:** the notebook scrolls itself to `region-table` and the selection
lands on `churn_rate=("churned", "mean")`. Don't zoom during the scroll — zoom
to 175% after it lands, hold 2s.

> **SAY:** "And the pointing goes the other way. I ask where churn is
> calculated, and the agent scrolls my notebook and selects the expression
> itself. Two participants pointing at things, the way two people at one
> keyboard would."

---

## Clip 6 — 1:56–2:24

**DO:** Select `converted / eligible_sessions` in `conversion-rate`,
right-click → **Add Comment**, type `Are we sure this denominator is right?`,
submit. Open the right sidebar **Agent** panel → **Comments** tab.

**TYPE:**

```text
Go through my unresolved comments and answer them. Don't change my existing cells.
```

**WATCH FOR:** the agent's reply landing in the same thread. Cut on the reply
appearing, then a 1.5s beat on the panel.

> **SAY:** "Review is an ordinary notebook feature, not an AI feature. I
> comment on my own code by hand. And here's the honest part: leaving that
> comment calls nobody. WebMCP gives a page no way to wake or notify an agent
> — it just changes the state the agent sees next time I ask. When it answers,
> we're in one thread, stored in the notebook's own metadata, so it travels
> with the file."

---

## Clip 7 — 2:24–2:50

**DO:** Right-click `conversion-rate` → **Agent Access** → cycle to **Hidden**.

**TYPE:**

```text
Read the conversion rate cell.
```

**WATCH FOR:** the agent reports the cell doesn't exist; the cell shows a
`Failed` badge. Click it — the popover names `CELL_NOT_FOUND` and the duration.

**DO:** Click into that same cell yourself and type a character to prove you
were never locked out, then undo. Set access back to **Editable**. At 2:46,
hard cut to T5 and hold 4s.

> **SAY:** "And I decide what the agent may touch, per cell. Hidden means the
> cell is indistinguishable from one that doesn't exist — but it never
> restricts me. Under the hood, this is one JupyterLab extension registering
> twenty-two tools once, through document dot modelContext dot registerTool.
> No server, no API key, no model of its own. Turn WebMCP off and the notebook
> still works."

---

## If it goes wrong on camera

| Symptom | Do |
| --- | --- |
| Unexpected `STALE_CELL` | **Keep the take.** Say "that's the guard — the agent has to reread." |
| Agent missed a manual edit | Re-ask; each call reads state as of that call |
| `KERNEL_UNAVAILABLE` | Wait for the kernel indicator to go idle, reshoot |
| `WebMCP unavailable` | Stop. Switch browsers. |
| Orphaned comment thread | Full reset, pick untouched text |
| Agent wanders | Use the **TYPE** blocks verbatim |

---

## Full narration, straight through (405 words ≈ 2:36 at 155 wpm)

> I built a JupyterLab extension that hands your live notebook to a browser
> agent over WebMCP. This is ordinary JupyterLite — notebooks, files and the
> Python kernel all run in this tab. No chat panel, no model picker, no server.
>
> The problem is that almost nothing about a working notebook exists on disk.
> The cell you haven't saved. The text you just highlighted. The kernel holding
> your data. A server-side integration reads the file, which doesn't match your
> screen — and on JupyterLite there is no server at all. WebMCP is the only way
> in.
>
> So I point with my own cursor — I select exactly the expression that looks
> wrong. The agent reads my selection, not my whole file. It reads the cell's
> current source and its hash, replaces only what I highlighted, then runs the
> cell as a separate, explicit step. And I can watch the whole thing: the cell
> rings, the badge says applying, and a plus-two-changed button opens the exact
> diff of what it wrote. No chat transcript required.
>
> Now I change the filter by hand and run it, without saving. The notebook is
> in a state the agent hasn't seen. It rereads the live model — my unsaved edit
> included — and adds a *visible* cell underneath, because it can't run
> arbitrary code. Every agent write carries a hash from what it read. If I'd
> changed that cell first, the write is refused, not merged.
>
> And the pointing goes the other way. I ask where churn is calculated, and the
> agent scrolls my notebook and selects the expression itself. Two participants
> pointing at things, the way two people at one keyboard would.
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
> Under the hood, this is one JupyterLab extension registering twenty-two tools
> once, through document dot modelContext dot registerTool. No server, no API
> key, no model of its own. Turn WebMCP off and the notebook still works.

---

## Upload

**Title:** `JupyterLite WebMCP — an agent inside the notebook you already have open`

**Description:**

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

Visibility **Public**. Category: Science & Technology. Synthetic-content
disclosure: **No**. Made for kids: **No**.

**Thumbnail:** the Clip 3 frame with `converted / visitors` highlighted blue,
agent panel visible at right. Overlay, lower third, white on 50% `#0b0b0d`:

```text
I select the code.
The agent fixes exactly that.
```

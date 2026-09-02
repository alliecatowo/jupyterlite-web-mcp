# Review comments

Review threads are an ordinary notebook feature, built and usable exactly
like a comment feature in a normal document editor. **No browser agent is
required to use them.** A human creates, replies to, resolves, reopens, and
navigates comments entirely from the notebook UI and the right-sidebar
Review panel (`src/review/panel.tsx`). A compatible browser agent
additionally participates through seven WebMCP tools
(`docs/webmcp-tools.md`), using exactly the same underlying store — there is
no separate "AI comment" format, author identity, or code path.

## Storage model

Review data lives inside the notebook's own metadata, so it saves, loads,
and downloads with the `.ipynb` file itself — no external database, no
comment server, no account service.

- **Metadata key:** `jupyterlite_webmcp_review`
  (`REVIEW_METADATA_KEY` in `src/review/model.ts`).
- **Schema version:** `1` (`REVIEW_SCHEMA_VERSION`), stored as
  `IReviewData.version` alongside the thread list, so a future incompatible
  change to the on-disk shape can be detected.
- **Thread shape (`IThread`):**
  ```ts
  {
    id: string;                 // uuid (crypto.randomUUID(), with a v4 fallback)
    status: 'open' | 'resolved';
    createdAt: string;          // ISO timestamp
    updatedAt: string;          // ISO timestamp, bumped on every reply/status change
    anchor: IAnchor;
    messages: IMessage[];
  }
  ```
- **Message shape (`IMessage`):**
  ```ts
  {
    id: string;
    author: { kind: 'human' | 'agent'; name: string | null };
    createdAt: string;
    body: string;               // bounded to 8 KiB by ReviewStore, 8192 chars by the model layer
  }
  ```
  Human messages use `HUMAN_AUTHOR` (`{ kind: 'human', name: null }`);
  agent-authored messages use `AGENT_AUTHOR`
  (`{ kind: 'agent', name: 'Browser agent' }`) — no other vendor identity is
  invented.

`ReviewStore.read()` (`src/review/storage.ts`) treats notebook metadata as
**untrusted input**: it may have been hand-edited, saved by an older schema
version, or be outright malformed. `normalizeReview()`
(`src/review/model.ts`) is deliberately defensive — it never throws, drops
any thread missing an `id`, a valid `anchor.cellId`, or a valid `messages`
array, and clamps every string field to a bounded length — so a corrupted or
foreign `jupyterlite_webmcp_review` key degrades to an empty thread list
rather than crashing the notebook.

## Anchor kinds

Every thread is anchored (`IAnchor`) to exactly one of:

- **`cell`** — the whole cell, by its stable nbformat cell id. The simplest
  and most robust anchor: it survives any edit to the cell's source.
- **`source-range`** — an exact range of a cell's source text, captured as
  the cell id, the selected text and its hash, the original line/column
  range, and a small amount of surrounding prefix/suffix context (up to 80
  characters each, `LIMITS.MAX_ANCHOR_CONTEXT`) used to disambiguate
  re-anchoring later. Useful for "is *this* denominator right?"
  comments on an exact expression.
- **`output`** — one output of a cell, by output index, a content
  fingerprint (`fingerprintOutput`, `src/jupyter/outputs.ts`) and a
  `mimeType` (SPEC §42) derived from that same output — `text/html` (if
  present), else the first `image/*` key, else `text/plain`, else
  `application/vnd.jupyter.error` for an error output. Both the human path
  (`src/review/commands.ts`) and the agent path (`src/webmcp/tools.ts`)
  build this anchor through the single shared `ReviewStore.buildOutputAnchor()`
  helper (`src/review/storage.ts`), so the two can never disagree on it.
  Older threads saved before `mimeType` existed keep working —
  `normalizeReview` treats it as optional. Useful for "why is this row such
  an outlier?" comments on a table or chart.

## Source-range re-anchoring

Line/column numbers alone are not enough to survive an edit elsewhere in
the cell, so a `source-range` anchor is re-resolved against the cell's
*current* source every time it is read (`resolveSourceAnchor`,
`src/review/anchors.ts`), following exactly this order:

1. If the anchor has no `selectedText` at all, it is **`orphaned`**.
2. If the *original* `sourceRange` still contains exactly `selectedText`,
   the anchor is **`exact`** — nothing moved.
3. Otherwise, every occurrence of `selectedText` in the current source is
   found:
   - **Zero occurrences** → **`orphaned`**. The text is gone; the thread is
     never guessed onto different code.
   - **Exactly one occurrence** → **`reanchored`** to that occurrence.
   - **More than one occurrence** → each occurrence is scored against the
     anchor's stored `prefix`/`suffix` context (an exact match on the
     stored prefix/suffix scores higher than a short 10-character match,
     which scores higher than no match). If exactly one occurrence has a
     strictly higher score than every other, it is **`reanchored`** to that
     occurrence. **If two or more occurrences tie for the best score, the
     result is `orphaned`, never a guess.**

A thread whose anchored cell no longer exists at all resolves to a fourth
state, **`cell-missing`**, determined by the caller (`ReviewStore.anchorStatus`)
before source re-anchoring is even attempted.

This resolved state (`exact` / `reanchored` / `orphaned` / `cell-missing`)
is surfaced in every read: as `anchor.state` in `jupyter_list_comments`, as
`anchorStatus.state` in `jupyter_get_comment` and `jupyter_focus_comment`,
and in the Review panel UI. **An orphaned anchor is displayed as orphaned,
never silently reattached to the wrong text.**

### Manual re-anchoring

A thread whose `anchorStatus.state` is `orphaned` or `cell-missing` gets a
**Re-anchor** button next to Reply in the Review panel
(`src/review/panel.tsx`). Clicking it takes the human's *current* editor
selection — the active cell plus whatever text is highlighted in it — and
rewrites the thread's anchor to a fresh `source-range` anchor
(`makeSourceAnchor`, `src/review/anchors.ts`) pointing at that selection,
via `ReviewStore.reanchor()` (`src/review/storage.ts`). The thread's `id`,
`status` and message history are preserved; only the anchor and
`updatedAt` change. If there is no non-empty selection when Re-anchor is
clicked, nothing happens — no dialog, no native `alert`, just a silent
no-op — the human simply selects text and clicks it again.

## Output anchoring and change detection

An `output` anchor stores the output's index and a fingerprint
(`fingerprintOutput`, `src/jupyter/outputs.ts`): a stable hash of the raw
output with volatile fields removed (`execution_count`), binary/base64
payloads reduced to `mimeType:length` rather than hashed by content, and
object keys sorted recursively so key order never affects the result.

If the cell is rerun and the output at that index changes, the thread is
**not** destroyed or dropped — `anchorStatus.outputChanged` becomes `true`
(surfaced in `jupyter_list_comments`/`jupyter_get_comment`, and shown in the
Review panel as "Output changed since this comment was created."). If the
output disappears entirely (fewer outputs than the anchored index), the
same `outputChanged: true` signal is set. Review history is never destroyed
by a rerun.

## Human workflow (no agent required)

From `src/review/commands.ts` and the context menu it registers:

- **Add Comment** (`jupyterlite-webmcp:add-comment`) — comments on the
  current editor selection if one exists (creating a `source-range`
  anchor), otherwise on the whole active cell (`cell` anchor).
- **Comment on Cell** (`jupyterlite-webmcp:add-cell-comment`) — always a
  whole-cell comment, regardless of any selection.
- **Comment on Output** (`jupyterlite-webmcp:add-output-comment`) — comments
  on whichever output of the active code cell was right-clicked, determined
  via `app.contextMenuHitTest` against the `.jp-OutputArea-child` DOM node
  under the pointer (`outputIndexFromNode`, `src/review/commands.ts`) rather
  than always output 0; only enabled when that cell has at least one
  output. If invoked from somewhere other than the context menu (e.g. the
  command palette) and the cell has more than one output, nothing is
  created rather than guessing which one was meant.
- **Show Review Panel** (`jupyterlite-webmcp:open-review`) — reveals the
  right-sidebar panel.

Each of the first three prompts for the comment body with a plain input
dialog, then creates the thread via `ReviewStore.createThread` with
`HUMAN_AUTHOR`, and reveals the Review panel.

From the **Review panel** itself (`src/review/panel.tsx`), a human can
filter by Open / Resolved / All / Current cell, reply to any thread,
resolve or reopen it, and click a thread to navigate to it: this reveals
the anchored cell and, for a resolved `source-range` anchor, selects the
exact text; for an `output` anchor, the specific `.jp-OutputArea-child` at
that index is scrolled into view and briefly highlighted
(`scrollOutputIntoView`, `jp-webmcp-outputHighlight` in
`style/base.css`) — the same behavior `jupyter_focus_comment` produces for
an agent-driven navigation.

Cells with any thread also get a small, purely cosmetic marker
(`src/review/markers.ts`): a CSS class plus `data-webmcp-threads`/
`data-webmcp-open-threads` attributes on the cell's DOM node, so it's
visible at a glance which cells have comments without opening the panel.
This marker is presentation only — nothing reads it back as a source of
truth.

## Agent workflow

A browser agent participates through the seven `jupyter_*_comment(s)` tools
documented in `docs/webmcp-tools.md`: `jupyter_list_comments`,
`jupyter_get_comment`, `jupyter_create_comment`, `jupyter_reply_comment`,
`jupyter_resolve_comment`, `jupyter_reopen_comment`, and
`jupyter_focus_comment`. Every one of them calls the exact same
`ReviewStore` methods the human commands and panel use; an agent-authored
thread or message is stored identically to a human one, tagged only with
`AGENT_AUTHOR` in its `author` field.

A characteristic flow (see `docs/demo-script.md` for the full scripted
version): a human leaves a comment on a suspicious calculation and another
on a table's outlier row, then later asks the agent to "go through my
unresolved comments." The agent calls `jupyter_list_comments`, reads each
thread's `context` via `jupyter_get_comment`, and either replies directly
(`jupyter_reply_comment`) when the existing cells/outputs already answer
the question, or — deliberately never through hidden kernel introspection —
inserts and runs a **visible** investigation cell
(`jupyter_insert_cell`/`jupyter_run_cells`) before replying, so the
notebook itself records how the conclusion was reached. The agent can also
be asked to review a notebook and leave comments **without** changing or
running anything, using only `jupyter_get_cells` and
`jupyter_create_comment`.

## No automatic triggering

**Creating a comment, replying to one, or resolving/reopening a thread
never calls, wakes, or notifies a browser agent — by a human or by the
agent itself.** WebMCP has no mechanism for a page to summon an agent's
attention; these actions only change the live thread state that an agent
will see the *next time* the human explicitly invokes it (for example, by
asking "go through my unresolved comments"). This mirrors the same
limitation that applies to every other piece of live state the extension
exposes (see the "WebMCP compatibility" section of the repository README).

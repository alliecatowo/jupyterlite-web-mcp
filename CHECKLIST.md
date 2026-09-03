# CHECKLIST.md

Everything still requiring a human before this entry is safely submitted.
**Deadline: 2026-09-03, 1:00 pm Pacific.**

## Project

- [ ] Nothing outstanding. All known doc/reality mismatches are fixed and verified against the deployed build.

## Repository

- [ ] **Make `github.com/alliecatowo/jupyterlite-web-mcp` PUBLIC.** The rules require an open-source, judge-accessible repository. It is currently private — this is a submission blocker.
- [ ] Set the repo description to the tagline in `SUBMISSION.md` §4, and the homepage field to `https://jupyterlite-web-mcp.vercel.app/lab/index.html`.
- [ ] Add repo topics: `webmcp`, `mcp`, `jupyterlab-extension`, `jupyterlite`, `pyodide`, `ai-agents`.
- [ ] Confirm the `Test` and `Site Build` workflows are green on the final commit.
- [ ] After any further commit, redeploy (`./scripts/deploy-vercel.sh`) and re-check that the live `jupyter-lite.json` loads the same `remoteEntry.*.js` hash as the local `dist/`.

## Demo recording

- [ ] Confirm a WebMCP-capable browser works: open the live demo, verify the bottom-right status bar reads `WebMCP ready`. **Without this there is no video** (`DEMO.md` §1).
- [ ] Set up capture: 1920×1080, Chrome window only, 125% zoom, bookmarks bar hidden, no music.
- [ ] Record the 7 clips in the order in `DEMO.md` §5, resetting per `DEMO.md` §4 before every take.
- [ ] In Clip 3, capture the full presence sequence: ring → `Applying…` badge → source change → `±2 changed` button → open the diff popover.
- [ ] Grab the B-roll listed in `DEMO.md` §5.
- [ ] Capture the thumbnail still (`DEMO.md` §9).
- [ ] Optional: cut a short looping GIF from the Clip 3 footage and add it back to `README.md` (the old one was deleted as stale).

## Video production

- [ ] Record the narration from `DEMO.md` §7 (405 words, ~2:36 at 155 wpm).
- [ ] Build the 5 title cards with the exact text in `DEMO.md` §2.
- [ ] Assemble to the timings in `DEMO.md` §3 and apply the listed zooms/cuts.
- [ ] Verify final runtime is **under 3:00** (target 2:45–2:50).
- [ ] Watch it once with audio only: confirm the voice alone covers what was built, the problem, why WebMCP, and how WebMCP was implemented.
- [ ] Export 1080p30.

## YouTube

- [ ] Upload with the title and description in `DEMO.md` §8.
- [ ] Set visibility to **Public** (not unlisted).
- [ ] Set the custom thumbnail.
- [ ] Answer "Altered or synthetic content": No. "Made for kids": No.
- [ ] Paste the chapter timestamps so chapters render.
- [ ] Open the URL logged out to confirm it is publicly playable.
- [ ] Paste the final URL into `SUBMISSION.md` §8.

## Devpost

- [ ] Register at <https://webmcp.devpost.com/> if not already registered.
- [ ] Project name — `SUBMISSION.md` §3.
- [ ] Tagline — `SUBMISSION.md` §4.
- [ ] "About the project" — paste the block between the `DEVPOST DESCRIPTION` markers in `SUBMISSION.md` §6.
- [ ] Built-with tags — `SUBMISSION.md` §14.
- [ ] Live URL and repository URL — `SUBMISSION.md` §5 and §7.
- [ ] Video demo link — the YouTube URL.
- [ ] Testing instructions — paste `SUBMISSION.md` §9.
- [ ] Upload the gallery image / thumbnail.
- [ ] Click **Submit** (a saved draft is not a submission).

## Final verification

- [ ] Record the submitted commit SHA in `SUBMISSION.md` §13.
- [ ] Open the live URL in a fresh private window and run the recommended prompt from `README.md` end to end.
- [ ] Open the repository URL logged out and confirm `README.md` and `LICENSE` render.
- [ ] Open the YouTube URL logged out and confirm it plays.
- [ ] Re-read the submitted Devpost entry as a stranger: live URL, repo URL, video URL all resolve.
- [ ] Confirm submission is in before **2026-09-03 13:00 PT**.

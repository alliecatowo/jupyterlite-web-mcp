---
layout: home
title: JupyterLite WebMCP

hero:
  name: JupyterLite WebMCP
  text: Your notebook is already in the browser. Now your agent can be too.
  tagline: A JupyterLab / JupyterLite extension that lets a browser agent read, edit, run and review the live notebook through WebMCP. No server, no API keys.
  actions:
    - theme: brand
      text: Try the live demo
      link: https://jupyterlite-web-mcp.vercel.app/lab/index.html
    - theme: alt
      text: Install
      link: /install
    - theme: alt
      text: View on GitHub
      link: https://github.com/alliecatowo/jupyterlite-web-mcp

features:
  - title: The live notebook, not a copy
    details: Unsaved edits, your exact text selection, the running kernel and its outputs. State that only exists inside the browser tab.
  - title: 22 WebMCP tools
    details: Read, navigate, edit, execute and review through document.modelContext. Every write is guarded by a source hash, so the human always wins.
    link: /webmcp-tools
    linkText: Tool reference
  - title: You decide what it may touch
    details: Per-cell and per-notebook access levels, plus Propose mode where every edit waits for your Accept or Deny.
    link: /propose-mode
    linkText: Propose mode
  - title: See it working
    details: Presence rings, state badges, inline diffs and output provenance show every agent action in the notebook itself.
  - title: Review threads in the file
    details: Comments live in the notebook metadata, so the conversation travels with the .ipynb.
  - title: JupyterLab, Notebook 7, JupyterLite
    details: One prebuilt extension, no Node.js or lab build step. pip install jupyterlite-webmcp.
    link: /install
    linkText: Install guide
---

<div style="max-width: 800px; margin: 3rem auto 0; padding: 0 1.5rem;">

<img src="./media/hero.gif" alt="Agent edits a notebook cell live in JupyterLite; a diff popover shows the exact +/- change before it's kept">

## Install

```bash
pip install jupyterlite-webmcp
jupyter lab
```

Published on [PyPI](https://pypi.org/project/jupyterlite-webmcp/). The extension
does something only in a browser that exposes `document.modelContext`; elsewhere
it stays out of the way.

Selected as one of the
[10 winners of the OpenAI WebMCP Challenge](https://webmcp.devpost.com/project-gallery).

</div>

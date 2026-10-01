---
layout: home
title: JupyterLite WebMCP
titleTemplate: Your notebook is already in the browser

hero:
  name: JupyterLite WebMCP
  text: Your notebook is already in the browser. Now your agent can be too.
  tagline: A JupyterLab and JupyterLite extension that lets a browser agent read, edit, run and review the live notebook through WebMCP. No server, no API keys.
  actions:
    - theme: brand
      text: Try the live demo
      link: https://jupyterlite-web-mcp.vercel.app/lab/index.html
    - theme: alt
      text: Get started
      link: /quickstart
    - theme: alt
      text: Roadmap
      link: /roadmap

features:
  - icon: 🧠
    title: The live notebook, not a copy
    details: Unsaved edits, your exact text selection, the running kernel and its outputs. State that exists only inside the tab.
    link: /concepts
    linkText: Why it matters
  - icon: 🛠️
    title: 22 WebMCP tools
    details: Read, navigate, edit, execute and review through document.modelContext. Writes are guarded by a source hash, so the human always wins.
    link: /webmcp-tools
    linkText: Tool reference
  - icon: 🔒
    title: You set the limits
    details: Per-cell and per-notebook access levels, plus Propose mode where each edit waits for your Accept or Deny.
    link: /propose-mode
    linkText: Propose mode
  - icon: 👀
    title: Visible by design
    details: Presence rings, state badges, inline diffs and output provenance show every agent action in the notebook itself.
  - icon: 💬
    title: Review threads in the file
    details: Comments live in the notebook metadata, so the conversation travels with the .ipynb.
  - icon: 📦
    title: One pip install
    details: A prebuilt extension for JupyterLab, Notebook 7 and JupyterLite. No Node.js, no lab build.
    link: /install
    linkText: Install
---

<div class="showcase">

## See it work

<p class="lede">The agent proposes a one-line fix inline. The diff is reviewable before it sticks: same cell, same kernel, same tab.</p>

<img src="./public/media/hero.gif" alt="Agent edits a notebook cell live in JupyterLite; a diff popover shows the exact +/- change before it's kept">

<div class="gallery">
<figure>
<img src="./public/media/screenshot-1-access-control.png" alt="Right-click cell menu showing Agent Access: Editable">
<figcaption><strong>Per-cell access control.</strong> Grant or lock the agent's write access, cell by cell.</figcaption>
</figure>
<figure>
<img src="./public/media/screenshot-2-presence.png" alt="Status bar reading Agent - running cell 5">
<figcaption><strong>Live presence.</strong> The status bar shows what the agent is doing as it happens.</figcaption>
</figure>
<figure>
<img src="./public/media/screenshot-3-review.png" alt="Add comment dialog attached to a specific expression in a cell">
<figcaption><strong>Inline review.</strong> Comment on any cell; the agent replies in the same thread.</figcaption>
</figure>
</div>

## Install

```bash
pip install jupyterlite-webmcp
jupyter lab
```

Published on [PyPI](https://pypi.org/project/jupyterlite-webmcp/). The extension only does something in a browser that exposes `document.modelContext`; elsewhere it stays out of the way. [Full install guide](/install).

## Built for the OpenAI WebMCP Challenge

Selected as one of the [10 winners](https://webmcp.devpost.com/project-gallery). Created by Allison Coleman ([@alliecatowo](https://github.com/alliecatowo)) with Juan Mendoza ([@mennymendoza](https://github.com/mennymendoza)). See where it's going on the [roadmap](/roadmap), and tell us what you want an agent to do in your notebook in [Discussions](https://github.com/alliecatowo/jupyterlite-web-mcp/discussions).

</div>

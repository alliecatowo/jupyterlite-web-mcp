# JupyterLite WebMCP demo

Your notebook is already in the browser. Now your agent can be too.

This is an ordinary JupyterLite deployment: the notebooks, files, and the
Python kernel all run locally in your browser tab. There is no Jupyter
server anywhere — everything you see and run here stays on this page.

**Try it:**

- Open `customer-analysis.ipynb`
- Run the cells
- Edit them
- Use the **Agent** panel in the right sidebar (Comments tab) to leave comments

## Notebooks

- **`customer-analysis.ipynb`** — the walkthrough. A straightforward look
  at conversion, spend, and churn, meant to be run top to bottom.
- **`needs-review.ipynb`** — has problems in it, on purpose. Good for
  handing to an agent and asking it to review the notebook or fix it.
- **`reviewed-analysis.ipynb`** — what a finished human-and-agent session
  looks like: a normal analysis, a cell the agent added while looking into
  a question, and a handful of review comments already in it. Open the
  **Agent** panel in the right sidebar (Comments tab) to read the
  conversation.

If your browser has a WebMCP-compatible agent installed, the same live
notebook — including unsaved edits, your current selection, outputs, and
review threads — is available to it as tools. When the agent acts, you see
it: the cell gets a ring and a `Reading… / Applying… / Running…` badge, an
edited cell grows a `±N changed` button that shows the exact before/after
diff, agent-run outputs are labelled `Run by Browser agent`, and the status
bar reads what it is doing right now.

If your browser has no agent, everything above still works exactly the
same — the panel, the comments, the access controls, all of it.

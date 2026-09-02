# JupyterLite WebMCP demo

Your notebook is already in the browser. Now your agent can be too.

This is an ordinary JupyterLite deployment: the notebooks, files, and the
Python kernel all run locally in your browser tab. There is no Jupyter
server anywhere — everything you see and run here stays on this page.

**Try it:**

- Open `customer-analysis.ipynb`
- Run the cells
- Edit them
- Use the Review panel in the right sidebar to leave comments

## Notebooks

- **`customer-analysis.ipynb`** — the walkthrough. A straightforward look
  at conversion, spend, and churn, meant to be run top to bottom.
- **`needs-review.ipynb`** — has problems in it, on purpose. Good for
  handing to an agent and asking it to review the notebook or fix it.
- **`reviewed-analysis.ipynb`** — what a finished human-and-agent session
  looks like: a normal analysis, a cell the agent added while looking into
  a question, and a handful of review comments already in it. Open the
  Review panel in the right sidebar to read the conversation.

If your browser has a WebMCP-compatible agent installed, the same live
notebook — including unsaved edits, your current selection, outputs, and
review threads — is available to it as tools. If it does not, everything
above still works exactly the same.

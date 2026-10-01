# Quickstart

Two ways in: use the hosted demo (nothing to install), or add the extension to
your own JupyterLab or JupyterLite.

## Try the hosted demo

<ol class="steps">
<li>Open the <a href="https://jupyterlite-web-mcp.vercel.app/lab/index.html">live demo</a> in ChatGPT's in-app browser, or in Google Chrome with WebMCP enabled.</li>
<li>Wait for the status bar (bottom right) to read <code>WebMCP ready</code>. If it says <code>WebMCP unavailable</code>, this browser doesn't expose <code>document.modelContext</code>: the notebook still works, but there are no agent tools.</li>
<li>Double-click <code>customer-analysis.ipynb</code> in the file browser and wait for the kernel to go idle.</li>
<li>Give your agent the prompt below and watch the notebook.</li>
</ol>

```text
Open customer-analysis.ipynb. The conversion rate looks wrong to me:
read the conversion-rate cell and check its denominator against how
eligible_sessions is defined further up. If it's wrong, fix only that
expression, rerun the cell, and leave a review comment on the line you
changed explaining why.
```

You should see the targeted cell ring and report `Applying…`,
`converted / visitors` become `converted / eligible_sessions`, a `±2 changed`
button appear (click it for the diff), the execution count increment, and a
review thread show up in the **Agent** panel.

### Then try the parts that aren't about prompting

- **Highlight** `eligible_sessions` and ask the agent what you selected. It reads the exact substring.
- **Right-click a cell → Agent Access → Hidden**, then ask the agent to read it. It will behave as if the cell doesn't exist, while you can still edit it.
- **Edit a cell without saving**, then ask the agent to rewrite it. The write is refused and your text is untouched.
- **Switch the Agent panel to Propose mode** and ask for another edit. It waits for your Accept or Deny. See [Propose mode](/propose-mode).

Other seeded notebooks: `needs-review.ipynb` (deliberate problems, good for a
review task) and `reviewed-analysis.ipynb` (a finished human-and-agent session
with review threads). `scratch.ipynb` is nearly empty, for experiments.

## Add it to your own notebooks

```bash
pip install jupyterlite-webmcp
jupyter labextension list   # should show jupyterlite-webmcp enabled OK
jupyter lab
```

For a JupyterLite site, add `jupyterlite-webmcp` to your `requirements.txt`
next to `jupyterlite-core` and the Pyodide kernel, then run `jupyter lite build`.
The [install guide](/install) covers each platform and how to verify it.

## Check the tools by hand

In a WebMCP-capable browser, open the devtools console:

```js
const tools = await document.modelContext.getTools();
tools.map(t => t.name);                                        // 22 names
const ctx = tools.find(t => t.name === 'jupyter_get_context');
JSON.parse(await document.modelContext.executeTool(ctx, '{}'));
```

Chrome passes arguments and results as JSON strings; each result parses to a
`{ content, structuredContent, isError }` envelope. The
[tool reference](/webmcp-tools) lists inputs, outputs, bounds and error codes.

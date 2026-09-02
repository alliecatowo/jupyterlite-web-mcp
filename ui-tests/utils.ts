import { Page } from '@playwright/test';
import { installWebMCPShim } from './webmcp-shim';

/**
 * Open JupyterLite's `/lab` and wait until the application shell (and, when
 * requested, the WebMCP test shim) is ready to drive.
 */
export async function openLab(
  page: Page,
  { webmcp = true, path }: { webmcp?: boolean; path?: string } = {}
): Promise<void> {
  if (webmcp) {
    await page.addInitScript(installWebMCPShim);
  }
  const url = '/lab/index.html' + (path ? '?path=' + encodeURIComponent(path) : '');
  await page.goto(url);
  await page.waitForFunction(() => !!(window as any).jupyterapp, null, {
    timeout: 120_000
  });
  await page.waitForSelector('#jp-main-dock-panel', { timeout: 120_000 });
  await page.evaluate(() => (window as any).jupyterapp.restored);
}

/** Wait until all 19 WebMCP tools have registered. */
export async function waitForTools(page: Page): Promise<void> {
  await page.waitForFunction(
    () => ((window as any).__webmcp?.toolNames() ?? []).length >= 19,
    null,
    { timeout: 60_000 }
  );
}

/** Invoke a registered WebMCP tool exactly the way an agent would. */
export async function callTool(page: Page, name: string, args?: Record<string, unknown>): Promise<any> {
  return page.evaluate(
    ([n, a]) => (window as any).__webmcp.call(n, a),
    [name, args ?? {}] as const
  );
}

/** Open a notebook via the `jupyter_open_notebook` tool and wait for it to render. */
export async function openNotebook(page: Page, path: string): Promise<any> {
  const result = await callTool(page, 'jupyter_open_notebook', { path });
  await page.waitForSelector('.jp-Notebook', { state: 'visible' });
  return result;
}

/** Poll `jupyter_get_context` until the kernel reports `idle`. Pyodide boot can be slow. */
export async function waitForKernelIdle(page: Page, timeout = 240_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const result = await callTool(page, 'jupyter_get_context');
    if (result?.payload?.kernel?.status === 'idle') {
      return;
    }
    if (Date.now() - start > timeout) {
      throw new Error(
        `Kernel did not become idle within ${timeout}ms; last context: ${JSON.stringify(result?.payload)}`
      );
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/** Simulate a HUMAN edit by writing directly into the live shared model. */
export async function setCellSourceAsHuman(page: Page, cellId: string, source: string): Promise<boolean> {
  return page.evaluate(
    ([id, src]) => {
      const app = (window as any).jupyterapp;
      const panel = app.shell.currentWidget;
      const cells = panel.context.model.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === id) {
          cells.get(i).sharedModel.setSource(src);
          return true;
        }
      }
      return false;
    },
    [cellId, source] as const
  );
}

/** Read a cell's live source straight from the shared model. */
export async function getCellSource(page: Page, cellId: string): Promise<string | null> {
  return page.evaluate(id => {
    const app = (window as any).jupyterapp;
    const panel = app.shell.currentWidget;
    const cells = panel.context.model.cells;
    for (let i = 0; i < cells.length; i++) {
      if (cells.get(i).id === id) {
        return cells.get(i).sharedModel.getSource();
      }
    }
    return null;
  }, cellId);
}

/** Activate a cell and select the first occurrence of `text` in its editor. */
export async function selectSourceRange(page: Page, cellId: string, text: string): Promise<boolean> {
  return page.evaluate(
    async ([id, needle]) => {
      const app = (window as any).jupyterapp;
      const panel = app.shell.currentWidget;
      const cells = panel.context.model.cells;
      let index = -1;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === id) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        return false;
      }
      panel.content.activeCellIndex = index;
      const widget = panel.content.widgets[index];
      await widget.ready;
      const editor = widget.editor;
      const source = editor.model.sharedModel.getSource();
      const idx = source.indexOf(needle);
      if (idx === -1) {
        return false;
      }
      editor.focus();
      editor.setSelection({
        start: editor.getPositionAt(idx),
        end: editor.getPositionAt(idx + needle.length)
      });
      return true;
    },
    [cellId, text] as const
  );
}

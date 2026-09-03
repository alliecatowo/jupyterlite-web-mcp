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

/** Wait until all 22 WebMCP tools have registered. */
export async function waitForTools(page: Page): Promise<void> {
  await page.waitForFunction(
    () => ((window as any).__webmcp?.toolNames() ?? []).length >= 22,
    null,
    { timeout: 60_000 }
  );
}

/**
 * Invoke a registered WebMCP tool exactly the way an agent would. `options`
 * forwards to the shim's own `call` (currently just `abortAfterMs`, for
 * exercising `AbortSignal` handling).
 */
export async function callTool(
  page: Page,
  name: string,
  args?: Record<string, unknown>,
  options?: { abortAfterMs?: number }
): Promise<any> {
  return page.evaluate(
    ([n, a, o]) => (window as any).__webmcp.call(n, a, o),
    [name, args ?? {}, options] as const
  );
}

/**
 * Fires a WebMCP tool call the way an agent would, but does not wait for it
 * to resolve: the returned promise settles as soon as the call has started,
 * not once the tool call itself finishes.
 *
 * For Propose mode, a mutating tool call's `execute()` Promise deliberately
 * does not resolve until the human accepts or denies it in the notebook UI
 * (`src/propose/tools.ts`), so a test needs to start the call, interact with
 * that UI, and only then wait for the result — `callTool`'s single
 * `page.evaluate` cannot express that because Playwright's `evaluate` itself
 * awaits whatever promise the page function returns. This stashes the
 * in-page promise on `window` under `key` instead of returning it, so this
 * call resolves immediately; retrieve the eventual result with
 * {@link awaitBackgroundCall}.
 */
export async function callToolInBackground(
  page: Page,
  key: string,
  name: string,
  args?: Record<string, unknown>
): Promise<void> {
  await page.evaluate(
    ([k, n, a]) => {
      (window as any)[k] = (window as any).__webmcp.call(n, a);
    },
    [key, name, args ?? {}] as const
  );
}

/** Awaits the result of a call previously started with {@link callToolInBackground}. */
export async function awaitBackgroundCall(page: Page, key: string): Promise<any> {
  return page.evaluate(k => (window as any)[k], key);
}

/**
 * Open a notebook via the `jupyter_open_notebook` tool and wait for it to be
 * the notebook the tools act on.
 *
 * Waiting on a bare `.jp-Notebook` selector is wrong once more than one
 * notebook is open: several match, and the first one in the DOM may be the
 * background tab, which never becomes visible. Ask the extension instead.
 */
export async function openNotebook(page: Page, path: string): Promise<any> {
  const result = await callTool(page, 'jupyter_open_notebook', { path });
  const deadline = Date.now() + 60_000;
  for (;;) {
    const context = await callTool(page, 'jupyter_get_context');
    if (context?.payload?.notebook?.path === path) {
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `"${path}" did not become the current notebook; last context: ${JSON.stringify(
          context?.payload?.notebook
        )}`
      );
    }
    await page.waitForTimeout(250);
  }
  await activeNotebook(page).waitFor({ state: 'visible', timeout: 60_000 });
  return result;
}

/** The notebook widget the user is actually looking at. */
export function activeNotebook(page: Page) {
  return page
    .locator('.jp-NotebookPanel:not(.lm-mod-hidden) .jp-Notebook')
    .first();
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

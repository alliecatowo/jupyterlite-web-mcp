import { Page, expect, test } from '@playwright/test';
import { callTool, openLab, openNotebook, waitForTools } from './utils';

const KEY = 'jupyterlite_webmcp';

/** Owner-side lockdown of the *open* notebook, through its live model. */
async function setLiveNotebookAccess(
  page: Page,
  access: 'write' | 'read' | 'none'
): Promise<void> {
  await page.evaluate(
    ([key, level]) => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      if (level === 'write') {
        panel.context.model.sharedModel.deleteMetadata(key);
      } else {
        panel.context.model.sharedModel.setMetadata(key, {
          notebookAccess: level
        });
      }
    },
    [KEY, access] as const
  );
}

/** Owner-side lockdown of a *closed* notebook, straight to its file. */
async function setFileNotebookAccess(
  page: Page,
  path: string,
  access: 'write' | 'read' | 'none'
): Promise<void> {
  await page.evaluate(
    async ([key, target, level]) => {
      const app = (window as any).jupyterapp;
      const model = await app.serviceManager.contents.get(target, {
        content: true
      });
      const metadata = { ...(model.content.metadata ?? {}) };
      if (level === 'write') {
        delete metadata[key];
      } else {
        metadata[key] = { notebookAccess: level };
      }
      await app.serviceManager.contents.save(target, {
        type: 'notebook',
        format: 'json',
        content: { ...model.content, metadata }
      });
    },
    [KEY, path, access] as const
  );
}

test.describe.serial('notebook-level agent access', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'scratch.ipynb');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.afterEach(async () => {
    await setLiveNotebookAccess(page, 'write');
  });

  test('a hidden notebook is invisible to list, open, get and context', async () => {
    await setFileNotebookAccess(page, 'needs-review.ipynb', 'none');

    const list = await callTool(page, 'jupyter_list_workspace', {});
    const paths = list.payload.entries.map((e: any) => e.path);
    expect(paths).not.toContain('needs-review.ipynb');
    expect(JSON.stringify(list.payload)).not.toContain('needs-review');

    const open = await callTool(page, 'jupyter_open_notebook', {
      path: 'needs-review.ipynb'
    });
    expect(open.ok).toBe(false);
    expect(open.payload.error).toBe('NOTEBOOK_NOT_FOUND');

    const cells = await callTool(page, 'jupyter_get_cells', {
      notebookPath: 'needs-review.ipynb'
    });
    expect(cells.ok).toBe(false);
    expect(cells.payload.error).toBe('NOTEBOOK_NOT_FOUND');

    // Indistinguishable from a file that does not exist: same code and the
    // same message shape, differing only in the path itself.
    const missing = await callTool(page, 'jupyter_get_cells', {
      notebookPath: 'no-such-notebook.ipynb'
    });
    expect(missing.ok).toBe(false);
    expect(missing.payload.error).toBe('NOTEBOOK_NOT_FOUND');
    expect(cells.payload.message).toBe(
      'No file exists at "needs-review.ipynb".'
    );
    expect(missing.payload.message).toBe(
      'No file exists at "no-such-notebook.ipynb".'
    );

    await setFileNotebookAccess(page, 'needs-review.ipynb', 'write');
  });

  test('a hidden current notebook reads like no notebook is open', async () => {
    await setLiveNotebookAccess(page, 'none');

    const context = await callTool(page, 'jupyter_get_context', {});
    expect(context.ok).toBe(true);
    expect(context.payload.notebook).toBeNull();
    expect(context.payload.focus).toBeNull();
    expect(context.payload.workspace.openDocuments).not.toContain(
      'scratch.ipynb'
    );
  });

  test('a read-only notebook reads normally but refuses every write', async () => {
    await setLiveNotebookAccess(page, 'read');

    const cells = await callTool(page, 'jupyter_get_cells', {});
    expect(cells.ok).toBe(true);
    expect(cells.payload.cells.length).toBeGreaterThan(0);

    const insert = await callTool(page, 'jupyter_insert_cell', {
      source: 'print("agent")'
    });
    expect(insert.ok).toBe(false);
    expect(insert.payload.error).toBe('NOTEBOOK_ACCESS_DENIED');

    const first = cells.payload.cells[0];
    const update = await callTool(page, 'jupyter_update_cell', {
      cellId: first.id,
      source: first.source ?? '',
      expectedSourceHash: first.sourceHash
    });
    expect(update.ok).toBe(false);
    expect(update.payload.error).toBe('NOTEBOOK_ACCESS_DENIED');

    const run = await callTool(page, 'jupyter_run_cells', {
      cellIds: [first.id]
    });
    expect(run.ok).toBe(false);
    expect(run.payload.error).toBe('NOTEBOOK_ACCESS_DENIED');

    const save = await callTool(page, 'jupyter_save_notebook', {});
    expect(save.ok).toBe(false);
    expect(save.payload.error).toBe('NOTEBOOK_ACCESS_DENIED');

    const comment = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'cell', cellId: first.id },
      message: 'a note'
    });
    expect(comment.ok).toBe(false);
    expect(comment.payload.error).toBe('NOTEBOOK_ACCESS_DENIED');
  });

  test('the Access tab sets the notebook level and applies it to all cells', async () => {
    await page.evaluate(() =>
      (window as any).jupyterapp.shell.activateById(
        'jupyterlite-webmcp-panel'
      )
    );
    await page.locator('.jp-webmcp-tabs button:has-text("Access")').click();
    await page.locator('.jp-webmcp-notebookAccess-select').selectOption('read');
    await page.locator('.jp-webmcp-notebookAccess-apply').click();

    const access = await callTool(page, 'jupyter_get_cell_access', {});
    expect(access.ok).toBe(true);
    expect(access.payload.cells.length).toBeGreaterThan(0);
    for (const cell of access.payload.cells) {
      expect(cell.access).toBe('read');
    }

    // And back: editable notebook level applied to every cell clears them.
    await page.locator('.jp-webmcp-notebookAccess-select').selectOption('write');
    await page.locator('.jp-webmcp-notebookAccess-apply').click();
    const cleared = await callTool(page, 'jupyter_get_cell_access', {});
    expect(cleared.ok).toBe(true);
    for (const cell of cleared.payload.cells) {
      expect(cell.access).toBe('write');
    }
  });
});

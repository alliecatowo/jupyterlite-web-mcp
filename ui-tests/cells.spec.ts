import { expect, test } from '@playwright/test';
import { callTool, getCellSource, openLab, openNotebook, setCellSourceAsHuman, waitForTools } from './utils';

test.describe('cell CRUD tools', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('jupyter_insert_cell inserts below a reference cell and is visible', async ({ page }) => {
    const before = await callTool(page, 'jupyter_get_context');
    const beforeCount = before.payload.notebook.cellCount;

    const { ok, payload } = await callTool(page, 'jupyter_insert_cell', {
      referenceCellId: 'conversion-rate',
      position: 'below',
      cellType: 'code',
      source: 'print("inserted by test")'
    });
    expect(ok).toBe(true);
    expect(typeof payload.cell.id).toBe('string');
    expect(typeof payload.cell.index).toBe('number');
    expect(payload.notebook.cellCount).toBe(beforeCount + 1);

    await expect(page.locator('.jp-Notebook')).toContainText('inserted by test');
  });

  test('jupyter_update_cell replaces source and returns a new sourceHash', async ({ page }) => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const oldHash = read.payload.cells[0].sourceHash;

    const newSource = 'working = df[df["plan"] != "free"].copy()\n# updated by test\nlen(working)';
    const { ok, payload } = await callTool(page, 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: newSource,
      expectedSourceHash: oldHash
    });
    expect(ok).toBe(true);
    expect(payload.cell.sourceHash).not.toBe(oldHash);

    const liveSource = await getCellSource(page, 'working-filter');
    expect(liveSource).toBe(newSource);
    await expect(page.locator('.jp-Notebook')).toContainText('updated by test');
  });

  test('CRITICAL: stale sourceHash is refused and never clobbers a human edit', async ({ page }) => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['region-table'] });
    const originalHash = read.payload.cells[0].sourceHash;

    const humanSource = '# the human typed this while the agent was thinking\nby_region = working.groupby("region").size()';
    const humanChanged = await setCellSourceAsHuman(page, 'region-table', humanSource);
    expect(humanChanged).toBe(true);

    const stale = await callTool(page, 'jupyter_update_cell', {
      cellId: 'region-table',
      source: 'agent_would_overwrite = True',
      expectedSourceHash: originalHash
    });
    expect(stale.ok).toBe(false);
    expect(stale.payload.error).toBe('STALE_CELL');
    expect(typeof stale.payload.currentSourceHash).toBe('string');
    expect(typeof stale.payload.currentSourcePreview).toBe('string');

    const liveSourceAfterRefusal = await getCellSource(page, 'region-table');
    expect(liveSourceAfterRefusal).toBe(humanSource);

    // A second update with the fresh hash succeeds.
    const fresh = await callTool(page, 'jupyter_get_cells', { cellIds: ['region-table'] });
    const freshHash = fresh.payload.cells[0].sourceHash;
    const success = await callTool(page, 'jupyter_update_cell', {
      cellId: 'region-table',
      source: 'agent_source_after_fresh_read = True',
      expectedSourceHash: freshHash
    });
    expect(success.ok).toBe(true);
    const finalSource = await getCellSource(page, 'region-table');
    expect(finalSource).toBe('agent_source_after_fresh_read = True');
  });

  test('jupyter_delete_cell removes a cell, and refuses a stale hash without deleting', async ({ page }) => {
    const before = await callTool(page, 'jupyter_get_context');
    const beforeCount = before.payload.notebook.cellCount;

    const inserted = await callTool(page, 'jupyter_insert_cell', {
      referenceCellId: 'spend-widget',
      position: 'below',
      cellType: 'code',
      source: 'throwaway = 1'
    });
    const cellId = inserted.payload.cell.id;
    const hash = inserted.payload.cell.sourceHash;

    // A wrong hash refuses the delete.
    const badDelete = await callTool(page, 'jupyter_delete_cell', {
      cellId,
      expectedSourceHash: 'not-the-real-hash'
    });
    expect(badDelete.ok).toBe(false);
    expect(badDelete.payload.error).toBe('STALE_CELL');

    const afterBadDelete = await callTool(page, 'jupyter_get_context');
    expect(afterBadDelete.payload.notebook.cellCount).toBe(beforeCount + 1);

    // The correct hash deletes it.
    const goodDelete = await callTool(page, 'jupyter_delete_cell', {
      cellId,
      expectedSourceHash: hash
    });
    expect(goodDelete.ok).toBe(true);
    expect(goodDelete.payload.deletedCellId).toBe(cellId);

    const afterGoodDelete = await callTool(page, 'jupyter_get_context');
    expect(afterGoodDelete.payload.notebook.cellCount).toBe(beforeCount);
  });

  test('error codes: CELL_NOT_FOUND, NOTEBOOK_NOT_FOUND, INVALID_PATH, INVALID_ARGUMENT', async ({ page }) => {
    const badCell = await callTool(page, 'jupyter_get_cells', { cellIds: ['does-not-exist'] });
    expect(badCell.ok).toBe(false);
    expect(badCell.payload.error).toBe('CELL_NOT_FOUND');

    const badNotebook = await callTool(page, 'jupyter_open_notebook', { path: 'nope.ipynb' });
    expect(badNotebook.ok).toBe(false);
    expect(badNotebook.payload.error).toBe('NOTEBOOK_NOT_FOUND');

    const badPath = await callTool(page, 'jupyter_open_notebook', { path: '../escape.ipynb' });
    expect(badPath.ok).toBe(false);
    expect(badPath.payload.error).toBe('INVALID_PATH');

    const missingHash = await callTool(page, 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'x = 1'
    });
    expect(missingHash.ok).toBe(false);
    expect(missingHash.payload.error).toBe('INVALID_ARGUMENT');
  });

  test('jupyter_focus_cell focuses a cell and selects an exact range', async ({ page }) => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['funnel-def'] });
    const source = read.payload.cells[0].source as string;
    const at = source.indexOf('eligible_sessions');
    const before = source.slice(0, at).split('\n');
    const startLine = before.length - 1;
    const startColumn = before[before.length - 1].length;
    const endColumn = startColumn + 'eligible_sessions'.length;

    const { ok, payload } = await callTool(page, 'jupyter_focus_cell', {
      cellId: 'funnel-def',
      selection: {
        start: { line: startLine, column: startColumn },
        end: { line: startLine, column: endColumn }
      }
    });
    expect(ok).toBe(true);
    expect(payload.focus.activeCellId).toBe('funnel-def');
    expect(payload.focus.textSelection.text).toBe('eligible_sessions');
  });

  test('opening a different notebook and back is reflected in context', async ({ page }) => {
    await openNotebook(page, 'scratch.ipynb');
    const scratchContext = await callTool(page, 'jupyter_get_context');
    expect(scratchContext.payload.notebook.path).toBe('scratch.ipynb');

    await openNotebook(page, 'customer-analysis.ipynb');
    const backContext = await callTool(page, 'jupyter_get_context');
    expect(backContext.payload.notebook.path).toBe('customer-analysis.ipynb');
  });

  test('jupyter_create_notebook refuses to overwrite, and jupyter_save_notebook saves', async ({ page }) => {
    const name = `test-notebook-${Date.now()}`;
    const created = await callTool(page, 'jupyter_create_notebook', { name });
    expect(created.ok).toBe(true);
    expect(created.payload.path).toBe(`${name}.ipynb`);

    const duplicate = await callTool(page, 'jupyter_create_notebook', { name });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.payload.error).toBe('PATH_EXISTS');

    await openNotebook(page, 'customer-analysis.ipynb');
    await setCellSourceAsHuman(page, 'intro-md', '# edited to make dirty');
    const dirtyContext = await callTool(page, 'jupyter_get_context');
    expect(dirtyContext.payload.notebook.dirty).toBe(true);

    const saved = await callTool(page, 'jupyter_save_notebook');
    expect(saved.ok).toBe(true);
    expect(saved.payload.saved).toBe(true);
    expect(saved.payload.dirty).toBe(false);
  });
});

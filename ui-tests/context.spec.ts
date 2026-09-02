import { expect, test } from '@playwright/test';
import {
  callTool,
  getCellSource,
  openLab,
  openNotebook,
  selectSourceRange,
  setCellSourceAsHuman,
  waitForTools
} from './utils';

test.describe('jupyter_get_context / jupyter_list_workspace', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('reports notebook path, cellCount, revision and kernel', async ({ page }) => {
    const { ok, payload } = await callTool(page, 'jupyter_get_context');
    expect(ok).toBe(true);
    expect(payload.notebook.path).toBe('customer-analysis.ipynb');
    expect(payload.notebook.cellCount).toBe(11);
    expect(typeof payload.notebook.revision).toBe('string');
    expect(payload.notebook.revision.length).toBeGreaterThan(0);
    expect(payload.kernel).not.toBeNull();
  });

  test('activating a cell is reflected in focus', async ({ page }) => {
    await page.evaluate(() => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      const cells = panel.context.model.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === 'conversion-rate') {
          panel.content.activeCellIndex = i;
          return;
        }
      }
    });
    const { payload } = await callTool(page, 'jupyter_get_context');
    expect(payload.focus.activeCellId).toBe('conversion-rate');
    expect(typeof payload.focus.activeCellIndex).toBe('number');
    expect(payload.focus.activeCellType).toBe('code');
  });

  test('placing the cursor is reflected in focus.cursor', async ({ page }) => {
    const placed = await page.evaluate(async () => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      const cells = panel.context.model.cells;
      let index = -1;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === 'conversion-rate') {
          index = i;
          break;
        }
      }
      panel.content.activeCellIndex = index;
      const widget = panel.content.widgets[index];
      await widget.ready;
      const editor = widget.editor;
      editor.focus();
      // Place the cursor right after "converted" on the first line, using
      // the editor's own offset math so the expectation can never drift
      // from how the editor actually represents positions.
      const offset = editor.model.sharedModel.getSource().indexOf('converted') + 'converted'.length;
      const position = editor.getPositionAt(offset);
      editor.setCursorPosition(position);
      return editor.getCursorPosition();
    });
    const { payload } = await callTool(page, 'jupyter_get_context');
    expect(payload.focus.cursor).toEqual(placed);
  });

  test('selecting source is reflected in focus.textSelection', async ({ page }) => {
    const selected = await selectSourceRange(page, 'conversion-rate', 'converted / visitors');
    expect(selected).toBe(true);
    const { payload } = await callTool(page, 'jupyter_get_context');
    expect(payload.focus.textSelection).not.toBeNull();
    expect(payload.focus.textSelection.text).toBe('converted / visitors');
    expect(typeof payload.focus.textSelection.start).toBe('object');
    expect(typeof payload.focus.textSelection.end).toBe('object');
  });

  test('jupyter_list_workspace lists files and never returns content', async ({ page }) => {
    const { ok, payload } = await callTool(page, 'jupyter_list_workspace');
    expect(ok).toBe(true);
    const names = payload.entries.map((e: any) => e.name);
    expect(names).toContain('customer-analysis.ipynb');
    expect(names).toContain('data');
    const dataEntry = payload.entries.find((e: any) => e.name === 'data');
    expect(dataEntry.type).toBe('directory');
    for (const entry of payload.entries) {
      expect(entry.content).toBeUndefined();
    }
  });

  test('exports the live notebook as bounded Markdown without image payloads', async ({ page }) => {
    const { ok, payload } = await callTool(page, 'jupyter_export_notebook', {
      includeOutputs: true
    });
    expect(ok).toBe(true);
    expect(payload.notebookPath).toBe('customer-analysis.ipynb');
    expect(payload.document).toContain('# Customer growth scratchpad');
    expect(payload.document).toContain('```python');
    expect(payload.document.length).toBeLessThanOrEqual(40 * 1024);
    expect(payload.document).not.toMatch(/data:image\//);
  });

  test('output-selection handoff returns null when no valid output text is selected', async ({ page }) => {
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const { ok, payload } = await callTool(page, 'jupyter_get_output_selection');
    expect(ok).toBe(true);
    expect(payload).toBeNull();
  });

  test('CRITICAL: unsaved human edits are visible via getCells/getContext, not the file on disk', async ({
    page
  }) => {
    const changed = await setCellSourceAsHuman(
      page,
      'working-filter',
      '# edited but not saved\nworking = df.copy()'
    );
    expect(changed).toBe(true);

    const cellsResult = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    expect(cellsResult.ok).toBe(true);
    expect(cellsResult.payload.cells[0].source).toBe('# edited but not saved\nworking = df.copy()');

    const contextResult = await callTool(page, 'jupyter_get_context');
    expect(contextResult.payload.notebook.dirty).toBe(true);

    // Confirm this really is the live model, not disk: re-reading via
    // getCellSource (the same live shared model path) agrees.
    const liveSource = await getCellSource(page, 'working-filter');
    expect(liveSource).toBe('# edited but not saved\nworking = df.copy()');
  });
});

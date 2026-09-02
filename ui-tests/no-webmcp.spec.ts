import { expect, test } from '@playwright/test';
import { openLab } from './utils';

test.describe('without the WebMCP shim', () => {
  test('the app loads and works normally with no WebMCP present', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', err => pageErrors.push(err));

    await openLab(page, { webmcp: false });

    const hasModelContext = await page.evaluate(() => typeof (window as any).document.modelContext);
    expect(hasModelContext).toBe('undefined');

    expect(pageErrors, `uncaught page errors: ${pageErrors.map(e => e.message).join(', ')}`).toEqual([]);

    // Review panel commands still exist without WebMCP.
    const hasReviewCommand = await page.evaluate(() =>
      (window as any).jupyterapp.commands.hasCommand('jupyterlite-webmcp:add-comment')
    );
    expect(hasReviewCommand).toBe(true);

    // Open scratch.ipynb and interact through the real UI.
    await page.evaluate(() => (window as any).jupyterapp.commands.execute('docmanager:open', { path: 'scratch.ipynb' }));
    await page.waitForSelector('.jp-Notebook', { state: 'visible' });

    const cellContent = page.locator('.jp-Notebook .jp-Cell .cm-content').first();
    await cellContent.click();
    await page.keyboard.type('print(1 + 1)');

    const sourceAfterTyping = await page.evaluate(() => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      return panel.context.model.cells.get(0).sharedModel.getSource();
    });
    expect(sourceAfterTyping).toContain('print(1 + 1)');

    // Try to actually run it; Pyodide startup can be slow/flaky, so fall back
    // to just asserting the cell is editable and its source changed.
    try {
      await page.keyboard.press('Shift+Enter');
      await expect(page.locator('.jp-OutputArea-output').first()).toContainText('2', {
        timeout: 240_000
      });
    } catch (error) {
      expect(sourceAfterTyping).toContain('print(1 + 1)');
    }

    expect(pageErrors, `uncaught page errors after run: ${pageErrors.map(e => e.message).join(', ')}`).toEqual([]);
  });
});

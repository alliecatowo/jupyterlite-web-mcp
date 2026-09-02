import { Page, expect, test } from '@playwright/test';
import { callTool, openLab, openNotebook, waitForKernelIdle, waitForTools } from './utils';

test.describe.serial('kernel execution', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // A single shared page across this file's tests: Pyodide's first boot is
    // slow, so we pay that cost once instead of once per test.
    page = await browser.newPage();
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'scratch.ipynb');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('runs a simple cell and shows its output', async () => {
    test.setTimeout(300_000);
    await waitForKernelIdle(page);

    const inserted = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'print(2 + 2)'
    });
    const cellId = inserted.payload.cell.id;

    const { ok, payload } = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    expect(ok).toBe(true);
    expect(payload.status).toBe('ok');
    const result = payload.results[0];
    expect(result.status).toBe('ok');
    expect(typeof result.executionCount).toBe('number');
    expect(result.outputSummary).toContain('4');

    await expect(page.locator('.jp-OutputArea-output').first()).toContainText('4');
  });

  test('a raised exception is reported per-cell and the notebook stays usable', async () => {
    test.setTimeout(300_000);
    await waitForKernelIdle(page);

    const inserted = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'raise ValueError("boom")'
    });
    const cellId = inserted.payload.cell.id;

    const { payload } = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    const result = payload.results[0];
    expect(result.status).toBe('error');
    expect(result.ename).toBe('ValueError');
    expect(result.evalue).toContain('boom');
    expect(typeof result.traceback).toBe('string');
    expect(result.traceback.length).toBeGreaterThan(0);
    expect(result.traceback.length).toBeLessThan(10 * 1024);

    // The notebook is still usable: another working cell runs fine afterwards.
    const workingCell = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'print("still working")'
    });
    const followUp = await callTool(page, 'jupyter_run_cells', {
      cellIds: [workingCell.payload.cell.id]
    });
    expect(followUp.payload.results[0].status).toBe('ok');
  });

  test('there is no tool that executes arbitrary source', async () => {
    const names: string[] = await page.evaluate(() => (window as any).__webmcp.toolNames());
    const suspicious = names.filter(n => /eval|exec|execute_code|run_code|kernel_eval/i.test(n));
    expect(suspicious).toEqual([]);

    const def = await page.evaluate(() => (window as any).__webmcp.definition('jupyter_run_cells'));
    const props = def.inputSchema.properties ?? {};
    expect(props.source).toBeUndefined();
    expect(props.code).toBeUndefined();
  });

  // Run last: this discards kernel state, which would break subsequent tests
  // in this file if it ran earlier.
  test('jupyter_kernel_action restart discards in-memory variables', async () => {
    test.setTimeout(300_000);
    await waitForKernelIdle(page);

    const { ok, payload } = await callTool(page, 'jupyter_kernel_action', { action: 'restart' });
    expect(ok).toBe(true);
    expect(payload.action).toBe('restart');
    expect(payload.message.toLowerCase()).toContain('in-memory');
  });
});

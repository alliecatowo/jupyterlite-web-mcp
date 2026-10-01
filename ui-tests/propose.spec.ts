import { Page, expect, test } from '@playwright/test';
import {
  awaitBackgroundCall,
  callTool,
  callToolInBackground,
  getCellSource,
  openLab,
  openNotebook,
  waitForTools
} from './utils';

/** Reads the human-only Direct/Propose mode toggle command. */
async function setMode(page: Page, mode: 'direct' | 'propose'): Promise<void> {
  await page.evaluate(
    m => (window as any).jupyterapp.commands.execute('jupyterlite-webmcp:set-propose-mode', { mode: m }),
    mode
  );
}

test.describe.serial('propose/deny mode', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test.afterAll(async () => {
    // Leave the shared page back in Direct mode, exactly as it started, in
    // case anything else opens this same page afterward.
    await setMode(page, 'direct');
    await page.close();
  });

  test('Direct mode applies jupyter_update_cell immediately, same as before this suite', async () => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;

    const result = await callTool(page, 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'working = df[df["plan"] != "free"].copy()  # direct-mode baseline',
      expectedSourceHash: hash
    });
    expect(result.ok).toBe(true);
    expect(result.payload.cell.source).toContain('direct-mode baseline');
    // No proposal banner ever appears in Direct mode.
    await expect(page.locator('.jp-webmcp-proposal')).toHaveCount(0);
  });

  test('CRITICAL: Propose mode holds the call pending, renders an inline diff, and Accept applies through the same path Direct mode uses', async () => {
    await setMode(page, 'propose');

    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;
    const beforeSource = read.payload.cells[0].source as string;
    const proposedSource = 'working = df[df["plan"] != "free"].copy()  # proposed by agent';

    await callToolInBackground(page, '__proposeAccept', 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: proposedSource,
      expectedSourceHash: hash
    });

    // The tool call is genuinely pending: the write has not landed, and the
    // notebook shows the reviewable diff inline, not a floating popover.
    const banner = page.locator('.jp-webmcp-proposal');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('jupyter_update_cell');
    await expect(banner).toContainText('proposed by agent'); // the "after" half of the diff
    expect(await getCellSource(page, 'working-filter')).toBe(beforeSource);

    await banner.locator('.jp-webmcp-proposal-accept').click();

    const result = await awaitBackgroundCall(page, '__proposeAccept');
    expect(result.ok).toBe(true);
    expect(result.raw.isError).toBeFalsy();
    expect(result.payload.status).toBe('accepted');
    expect(result.payload.cell.source).toBe(proposedSource);

    await expect(banner).toHaveCount(0);
    expect(await getCellSource(page, 'working-filter')).toBe(proposedSource);
  });

  test('CRITICAL: Propose mode Deny-with-reason resolves as a non-error result, and the agent sees the reason', async () => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;
    const beforeSource = read.payload.cells[0].source as string;

    await callToolInBackground(page, '__proposeDeny', 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'working = "this must never land"',
      expectedSourceHash: hash
    });

    const banner = page.locator('.jp-webmcp-proposal');
    await expect(banner).toBeVisible();

    await banner.locator('.jp-webmcp-proposal-reason').fill('Not while the pipeline is running.');
    await banner.locator('.jp-webmcp-proposal-deny').click();

    const result = await awaitBackgroundCall(page, '__proposeDeny');
    // A denial is a normal, non-error tool result: the agent's next turn
    // sees why, not a failure to recover from.
    expect(result.ok).toBe(true);
    expect(result.raw.isError).toBeFalsy();
    expect(result.payload.status).toBe('denied');
    expect(result.payload.code).toBe('PROPOSAL_DENIED');
    expect(result.payload.reason).toBe('Not while the pipeline is running.');

    await expect(banner).toHaveCount(0);
    expect(await getCellSource(page, 'working-filter')).toBe(beforeSource);
  });

  test('a denial with an empty reason resolves reason: null', async () => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;

    await callToolInBackground(page, '__proposeDenyNoReason', 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'working = "also must never land"',
      expectedSourceHash: hash
    });

    const banner = page.locator('.jp-webmcp-proposal');
    await expect(banner).toBeVisible();
    // No reason typed: deny immediately.
    await banner.locator('.jp-webmcp-proposal-deny').click();

    const result = await awaitBackgroundCall(page, '__proposeDenyNoReason');
    expect(result.payload.status).toBe('denied');
    expect(result.payload.reason).toBeNull();
  });

  test('a second proposal on a cell that already has one pending is refused with PROPOSAL_ALREADY_PENDING', async () => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;

    await callToolInBackground(page, '__firstPending', 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'working = "first proposal"',
      expectedSourceHash: hash
    });
    await expect(page.locator('.jp-webmcp-proposal')).toBeVisible();

    const second = await callTool(page, 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'working = "second proposal"',
      expectedSourceHash: hash
    });
    expect(second.ok).toBe(false);
    expect(second.payload.error).toBe('PROPOSAL_ALREADY_PENDING');

    // Clean up the still-pending first call so it does not leak into the
    // next test.
    await page.locator('.jp-webmcp-proposal-deny').click();
    await awaitBackgroundCall(page, '__firstPending');
    await expect(page.locator('.jp-webmcp-proposal')).toHaveCount(0);
  });

  test('aborting the tool call cleanly cancels the pending proposal, without applying the write', async () => {
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;
    const beforeSource = read.payload.cells[0].source as string;

    const result = await callTool(
      page,
      'jupyter_update_cell',
      { cellId: 'working-filter', source: 'working = "should be aborted"', expectedSourceHash: hash },
      { abortAfterMs: 300 }
    );
    expect(result.ok).toBe(false);
    expect(result.payload.error).toBe('ABORTED');

    // The banner must not linger after the call it belonged to was aborted.
    await expect(page.locator('.jp-webmcp-proposal')).toHaveCount(0);
    expect(await getCellSource(page, 'working-filter')).toBe(beforeSource);
  });

  test('a moved cell keeps its banner (and a half-typed reason) and can still be decided', async () => {
    await setMode(page, 'propose');
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: ['working-filter'] });
    const hash = read.payload.cells[0].sourceHash;
    const beforeSource = read.payload.cells[0].source as string;

    await callToolInBackground(page, '__proposeMoved', 'jupyter_update_cell', {
      cellId: 'working-filter',
      source: 'working = "proposed, then the cell was moved"',
      expectedSourceHash: hash
    });
    const banner = page.locator('.jp-webmcp-proposal');
    await expect(banner).toBeVisible();
    await banner.locator('.jp-webmcp-proposal-reason').fill('Moved it first');

    // A move replaces the cell's widget; do it both ways, as the human
    // would with the toolbar arrows.
    for (const delta of [1, -1]) {
      await moveCell(page, 'working-filter', delta);
      await expect(banner).toHaveCount(1);
      await expect(banner).toBeVisible();
      await expect(banner.locator('.jp-webmcp-proposal-reason')).toHaveValue('Moved it first');
    }

    await banner.locator('.jp-webmcp-proposal-deny').click();
    const result = await awaitBackgroundCall(page, '__proposeMoved');
    expect(result.payload.status).toBe('denied');
    expect(result.payload.reason).toBe('Moved it first');
    await expect(banner).toHaveCount(0);
    expect(await getCellSource(page, 'working-filter')).toBe(beforeSource);
  });
});

/** Moves a cell by `delta` positions through the shared model, as the move commands do. */
async function moveCell(page: Page, cellId: string, delta: number): Promise<void> {
  await page.evaluate(
    ([id, d]) => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      const cells = panel.context.model.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === id) {
          panel.context.model.sharedModel.moveCell(i, i + d);
          return;
        }
      }
      throw new Error(`no cell ${id}`);
    },
    [cellId, delta] as const
  );
}

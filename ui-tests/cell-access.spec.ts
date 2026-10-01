import { Page, expect, test } from '@playwright/test';
import { callTool, getCellSource, openLab, openNotebook, waitForTools } from './utils';

/** A cell no other step of this spec edits. */
const TARGET = 'funnel-def';
const MISSING = 'no-such-cell-id';

/**
 * Activates `cellId` and runs the human-only context-menu command, which
 * cycles that cell's agent access write -> read -> none -> write.
 */
async function cycleCellAccess(page: Page, cellId: string): Promise<void> {
  await page.evaluate(async id => {
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
      throw new Error(`cell ${id} missing`);
    }
    panel.content.activeCellIndex = index;
    await app.commands.execute('jupyterlite-webmcp:cycle-cell-access');
  }, cellId);
}

/** The access level the agent sees for `cellId`, or `null` if it is hidden. */
async function agentAccess(page: Page, cellId: string): Promise<string | null> {
  const range = await callTool(page, 'jupyter_get_cell_access', {
    startIndex: 0,
    endIndex: 100
  });
  expect(range.ok).toBe(true);
  const cell = range.payload.cells.find((c: any) => c.cellId === cellId);
  return cell ? cell.access : null;
}

test.describe('per-cell agent access', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('read cells refuse writes; hidden cells read exactly like missing ones', async ({
    page
  }) => {
    // Read the real hash first, so every refusal below can only be about
    // access, never a STALE_CELL.
    const read = await callTool(page, 'jupyter_get_cells', { cellIds: [TARGET] });
    expect(read.ok).toBe(true);
    const hash: string = read.payload.cells[0].sourceHash;
    const original = await getCellSource(page, TARGET);
    expect(original).not.toBeNull();
    expect(await agentAccess(page, TARGET)).toBe('write');

    let cycles = 0;
    try {
      // write -> read
      await cycleCellAccess(page, TARGET);
      cycles++;
      expect(await agentAccess(page, TARGET)).toBe('read');

      const update = await callTool(page, 'jupyter_update_cell', {
        cellId: TARGET,
        source: 'agent_should_not_write = True',
        expectedSourceHash: hash
      });
      expect(update.ok).toBe(false);
      expect(update.payload.error).toBe('CELL_ACCESS_DENIED');
      expect(update.payload.cellId).toBe(TARGET);
      expect(update.payload.access).toBe('read');
      expect(await getCellSource(page, TARGET)).toBe(original);

      const del = await callTool(page, 'jupyter_delete_cell', {
        cellId: TARGET,
        expectedSourceHash: hash
      });
      expect(del.ok).toBe(false);
      expect(del.payload.error).toBe('CELL_ACCESS_DENIED');
      expect(del.payload.cellId).toBe(TARGET);
      // Still there, untouched.
      expect(await getCellSource(page, TARGET)).toBe(original);

      // read -> none
      await cycleCellAccess(page, TARGET);
      cycles++;
      expect(await agentAccess(page, TARGET)).toBeNull();

      const hidden = await callTool(page, 'jupyter_update_cell', {
        cellId: TARGET,
        source: 'agent_should_not_write = True',
        expectedSourceHash: hash
      });
      const missing = await callTool(page, 'jupyter_update_cell', {
        cellId: MISSING,
        source: 'agent_should_not_write = True',
        expectedSourceHash: hash
      });
      expect(hidden.ok).toBe(false);
      expect(missing.ok).toBe(false);
      expect(missing.payload.error).toBe('CELL_NOT_FOUND');
      expect(hidden.payload.error).toBe(missing.payload.error);
      // Same shape, and nothing beyond the id the agent itself supplied.
      expect(Object.keys(hidden.payload).sort()).toEqual(
        Object.keys(missing.payload).sort()
      );
      expect(hidden.payload).not.toHaveProperty('access');
      expect(hidden.payload.message.split(TARGET).join('<id>')).toBe(
        missing.payload.message.split(MISSING).join('<id>')
      );
      expect(JSON.stringify(hidden.payload)).not.toContain(original as string);
      expect(await getCellSource(page, TARGET)).toBe(original);
    } finally {
      // Restore the default: none -> write (or finish the cycle from wherever
      // a failure left it).
      while (cycles % 3 !== 0) {
        await cycleCellAccess(page, TARGET);
        cycles++;
      }
    }
    expect(await agentAccess(page, TARGET)).toBe('write');
  });
});

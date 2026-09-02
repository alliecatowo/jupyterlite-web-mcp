import { expect, test } from '@playwright/test';
import { openLab, waitForTools } from './utils';

const EXPECTED_TOOL_NAMES = [
  'jupyter_get_context',
  'jupyter_list_workspace',
  'jupyter_open_notebook',
  'jupyter_create_notebook',
  'jupyter_get_cells',
  'jupyter_insert_cell',
  'jupyter_update_cell',
  'jupyter_delete_cell',
  'jupyter_run_cells',
  'jupyter_focus_cell',
  'jupyter_save_notebook',
  'jupyter_kernel_action',
  'jupyter_list_comments',
  'jupyter_get_comment',
  'jupyter_create_comment',
  'jupyter_reply_comment',
  'jupyter_resolve_comment',
  'jupyter_reopen_comment',
  'jupyter_focus_comment'
];

const READ_ONLY_TOOLS = [
  'jupyter_get_context',
  'jupyter_list_workspace',
  'jupyter_get_cells',
  'jupyter_list_comments',
  'jupyter_get_comment'
];

test.describe('extension activation', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page);
    await waitForTools(page);
  });

  test('both plugins are activated', async ({ page }) => {
    const activated = await page.evaluate(() => {
      const app = (window as any).jupyterapp;
      return {
        reviewHas: app.hasPlugin('jupyterlite-webmcp:review'),
        reviewActive: app.isPluginActivated('jupyterlite-webmcp:review'),
        toolsHas: app.hasPlugin('jupyterlite-webmcp:tools'),
        toolsActive: app.isPluginActivated('jupyterlite-webmcp:tools')
      };
    });
    expect(activated.reviewHas).toBe(true);
    expect(activated.reviewActive).toBe(true);
    expect(activated.toolsHas).toBe(true);
    expect(activated.toolsActive).toBe(true);
  });

  test('all 19 tools register with the expected names, no duplicates', async ({ page }) => {
    const names = await page.evaluate(() => (window as any).__webmcp.toolNames());
    const registrations = await page.evaluate(() => (window as any).__webmcp.registrations());
    const duplicates = await page.evaluate(() => (window as any).__webmcp.duplicates());

    expect(names.length).toBe(19);
    expect([...names].sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
    expect(duplicates).toEqual([]);
    expect(registrations.length).toBe(19);
  });

  test('tool definitions are well-formed', async ({ page }) => {
    for (const name of EXPECTED_TOOL_NAMES) {
      const def = await page.evaluate(n => (window as any).__webmcp.definition(n), name);
      expect(def, `definition for ${name}`).not.toBeNull();
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
      expect(typeof def.inputSchema).toBe('object');
      expect(def.inputSchema).not.toBeNull();
      expect(typeof def.annotations).toBe('object');
      expect(typeof def.annotations.readOnlyHint).toBe('boolean');

      if (READ_ONLY_TOOLS.includes(name)) {
        expect(def.annotations.readOnlyHint, `${name} should be readOnlyHint`).toBe(true);
      }
    }
  });

  test('tools returning notebook content are marked untrustedContentHint', async ({ page }) => {
    // Every tool whose result may include cell source, output, or comment
    // text the user (or someone else) wrote should carry untrustedContentHint.
    const contentBearing = [
      'jupyter_get_context',
      'jupyter_list_workspace',
      'jupyter_open_notebook',
      'jupyter_get_cells',
      'jupyter_insert_cell',
      'jupyter_update_cell',
      'jupyter_run_cells',
      'jupyter_list_comments',
      'jupyter_get_comment'
    ];
    for (const name of contentBearing) {
      const def = await page.evaluate(n => (window as any).__webmcp.definition(n), name);
      expect(def.annotations.untrustedContentHint, `${name} should be untrustedContentHint`).toBe(true);
    }
  });

  test('status bar shows a WebMCP status item', async ({ page }) => {
    const status = page.locator('.jp-webmcp-StatusItem');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/^WebMCP/);
  });
});

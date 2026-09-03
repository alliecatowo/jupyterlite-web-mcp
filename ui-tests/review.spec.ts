import { Page, expect, test } from '@playwright/test';
import {
  callTool,
  openLab,
  openNotebook,
  selectSourceRange,
  setCellSourceAsHuman,
  waitForKernelIdle,
  waitForTools
} from './utils';

test.describe.serial('review comments', () => {
  let page: Page;
  let sourceRangeThreadId: string;
  let outputThreadId: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openLab(page);
    await waitForTools(page);
    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('a human creates a whole-cell thread through the real UI', async () => {
    // Activate a cell, then run the add-cell-comment command and drive its dialog.
    await page.evaluate(() => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      const cells = panel.context.model.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === 'by-region-md') {
          panel.content.activeCellIndex = i;
          return;
        }
      }
    });
    void page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('jupyterlite-webmcp:add-cell-comment')
    );
    await page.waitForSelector('.jp-Dialog');
    await page.locator('.jp-Dialog input').fill('This section needs a caption.');
    await page.locator('.jp-Dialog .jp-mod-accept').click();
    await page.waitForSelector('.jp-Dialog', { state: 'detached' });

    await page.evaluate(() => (window as any).jupyterapp.commands.execute('jupyterlite-webmcp:open-review'));
    const panel = page.locator('.jp-webmcp-Comments');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('This section needs a caption.');
  });

  test('agent creates a source-range thread', async () => {
    const { ok, payload } = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'source-range', cellId: 'conversion-rate', text: 'converted / visitors' },
      message: 'Should this guard against visitors == 0?'
    });
    expect(ok).toBe(true);
    expect(payload.thread.anchor.kind).toBe('source-range');
    expect(typeof payload.thread.anchor.selectedTextHash).toBe('string');
    sourceRangeThreadId = payload.thread.id;

    const list = await callTool(page, 'jupyter_list_comments', { status: 'all' });
    const ids = list.payload.threads.map((t: any) => t.threadId);
    expect(ids).toContain(sourceRangeThreadId);
  });

  test('agent creates an output thread, and refuses one with no outputs', async () => {
    await openNotebook(page, 'scratch.ipynb');
    const inserted = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'print("out")'
    });
    const cellId = inserted.payload.cell.id;

    // No outputs yet: creating an output comment must fail.
    const noOutput = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'output', cellId, outputIndex: 0 },
      message: 'premature comment'
    });
    expect(noOutput.ok).toBe(false);
    expect(noOutput.payload.error).toBe('COMMENT_ANCHOR_STALE');

    await callTool(page, 'jupyter_kernel_action', { action: 'interrupt' }).catch(() => undefined);
    // Run it so it has an output. Kernel may still be booting; give it time.
    test.setTimeout(300_000);
    let ran = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    const start = Date.now();
    while (ran.payload?.results?.[0]?.status === undefined && Date.now() - start < 240_000) {
      await new Promise(r => setTimeout(r, 1000));
      ran = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    }
    expect(ran.payload.results[0].status).toBe('ok');

    const { ok, payload } = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'output', cellId, outputIndex: 0 },
      message: 'nice output'
    });
    expect(ok).toBe(true);
    expect(typeof payload.thread.anchor.outputFingerprint).toBe('string');
    outputThreadId = payload.thread.id;

    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('reply, resolve and reopen a thread, preserving history', async () => {
    const beforeReply = await callTool(page, 'jupyter_get_comment', { threadId: sourceRangeThreadId });
    const beforeCount = beforeReply.payload.thread.messages.length;

    const replied = await callTool(page, 'jupyter_reply_comment', {
      threadId: sourceRangeThreadId,
      message: 'Good catch, I will add a guard.'
    });
    expect(replied.ok).toBe(true);
    expect(replied.payload.thread.messages.length).toBe(beforeCount + 1);
    const lastMessage = replied.payload.thread.messages[replied.payload.thread.messages.length - 1];
    expect(lastMessage.author.kind).toBe('agent');

    const resolved = await callTool(page, 'jupyter_resolve_comment', { threadId: sourceRangeThreadId });
    expect(resolved.ok).toBe(true);
    expect(resolved.payload.thread.status).toBe('resolved');
    expect(resolved.payload.thread.messages.length).toBe(beforeCount + 1);

    const reopened = await callTool(page, 'jupyter_reopen_comment', { threadId: sourceRangeThreadId });
    expect(reopened.ok).toBe(true);
    expect(reopened.payload.thread.status).toBe('open');
    expect(reopened.payload.thread.messages.length).toBe(beforeCount + 1);
  });

  test('jupyter_get_comment returns the thread, anchorStatus and anchored cell context', async () => {
    const { ok, payload } = await callTool(page, 'jupyter_get_comment', { threadId: sourceRangeThreadId });
    expect(ok).toBe(true);
    expect(payload.thread.id).toBe(sourceRangeThreadId);
    expect(typeof payload.anchorStatus).toBe('object');
    expect(payload.context.cell).toBeTruthy();
    expect(payload.context.cell.id).toBe('conversion-rate');
  });

  test('jupyter_focus_comment activates the anchored cell and selection', async () => {
    const { ok, payload } = await callTool(page, 'jupyter_focus_comment', { threadId: sourceRangeThreadId });
    expect(ok).toBe(true);

    const context = await callTool(page, 'jupyter_get_context');
    expect(context.payload.focus.activeCellId).toBe('conversion-rate');
    expect(context.payload.focus.textSelection.text).toBe('converted / visitors');
  });

  test('CRITICAL: the anchor survives a harmless edit that keeps the text intact', async () => {
    const currentSource = (
      await callTool(page, 'jupyter_get_cells', { cellIds: ['conversion-rate'] })
    ).payload.cells[0].source as string;
    const edited = `# a clarifying comment added by a human\n${currentSource}`;
    const changed = await setCellSourceAsHuman(page, 'conversion-rate', edited);
    expect(changed).toBe(true);

    const { payload } = await callTool(page, 'jupyter_get_comment', { threadId: sourceRangeThreadId });
    expect(['exact', 'reanchored']).toContain(payload.anchorStatus.state);
  });

  test('CRITICAL: removing the anchored text orphans the thread, never re-anchors wrongly', async () => {
    const replaced = await setCellSourceAsHuman(
      page,
      'conversion-rate',
      'conversion_rate = None  # the old formula was removed entirely'
    );
    expect(replaced).toBe(true);

    const { payload } = await callTool(page, 'jupyter_get_comment', { threadId: sourceRangeThreadId });
    expect(payload.anchorStatus.state).toBe('orphaned');
    // The thread and its messages still exist.
    expect(payload.thread.id).toBe(sourceRangeThreadId);
    expect(payload.thread.messages.length).toBeGreaterThan(0);
  });

  test('threads persist in notebook metadata and travel through save/reload', async () => {
    const metadata = await page.evaluate(() => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      return panel.context.model.sharedModel.getMetadata()['jupyterlite_webmcp_review'];
    });
    expect(metadata).toBeTruthy();
    expect(metadata.version).toBe(1);
    const threadIds = metadata.threads.map((t: any) => t.id);
    expect(threadIds).toContain(sourceRangeThreadId);

    await callTool(page, 'jupyter_save_notebook');
    await page.reload();
    await page.waitForFunction(() => !!(window as any).jupyterapp, null, { timeout: 120_000 });
    await page.waitForSelector('#jp-main-dock-panel', { timeout: 120_000 });
    await page.evaluate(() => (window as any).jupyterapp.restored);
    await waitForTools(page);
    await openNotebook(page, 'customer-analysis.ipynb');

    const list = await callTool(page, 'jupyter_list_comments', { status: 'all' });
    const ids = list.payload.threads.map((t: any) => t.threadId);
    expect(ids).toContain(sourceRangeThreadId);
  });

  test('jupyter_get_comment with a bogus id returns COMMENT_NOT_FOUND', async () => {
    const { ok, payload } = await callTool(page, 'jupyter_get_comment', { threadId: 'no-such-thread' });
    expect(ok).toBe(false);
    expect(payload.error).toBe('COMMENT_NOT_FOUND');
  });

  test('CRITICAL: the output-change indicator ignores execution_count but flags a real output change, without losing history', async () => {
    test.setTimeout(300_000);
    await openNotebook(page, 'scratch.ipynb');
    await waitForKernelIdle(page);

    const inserted = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'print("fingerprint-a")'
    });
    const cellId = inserted.payload.cell.id;
    const sourceHash = inserted.payload.cell.sourceHash;

    const firstRun = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    expect(firstRun.payload.results[0].status).toBe('ok');
    const firstExecutionCount = firstRun.payload.results[0].executionCount;

    const created = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'output', cellId, outputIndex: 0 },
      message: 'What does this print?'
    });
    expect(created.ok).toBe(true);
    const threadId = created.payload.thread.id;

    // Re-run the SAME cell unchanged. execution_count bumps, but the output
    // fingerprint deliberately ignores it, so a harmless rerun must not trip
    // the "output changed" flag.
    const rerun = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    expect(rerun.payload.results[0].status).toBe('ok');
    expect(rerun.payload.results[0].executionCount).not.toBe(firstExecutionCount);

    const afterHarmlessRerun = await callTool(page, 'jupyter_get_comment', { threadId });
    expect(afterHarmlessRerun.ok).toBe(true);
    expect(afterHarmlessRerun.payload.anchorStatus.outputChanged).toBe(false);

    // Now change the source so it produces DIFFERENT output, re-run, and the
    // indicator must flip - while the thread and its messages survive intact.
    const updated = await callTool(page, 'jupyter_update_cell', {
      cellId,
      source: 'print("fingerprint-b")',
      expectedSourceHash: sourceHash
    });
    expect(updated.ok).toBe(true);

    const rerun2 = await callTool(page, 'jupyter_run_cells', { cellIds: [cellId] });
    expect(rerun2.payload.results[0].status).toBe('ok');

    const afterRealChange = await callTool(page, 'jupyter_get_comment', { threadId });
    expect(afterRealChange.ok).toBe(true);
    expect(afterRealChange.payload.anchorStatus.outputChanged).toBe(true);
    expect(afterRealChange.payload.thread.id).toBe(threadId);
    expect(afterRealChange.payload.thread.messages.length).toBeGreaterThan(0);

    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('a human creates a source-range comment through the real UI', async () => {
    await openNotebook(page, 'scratch.ipynb');
    const inserted = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'total = 1 + 2\nprint(total)'
    });
    const cellId = inserted.payload.cell.id;

    const selected = await selectSourceRange(page, cellId, 'total = 1 + 2');
    expect(selected).toBe(true);

    // add-comment opens a modal `.jp-Dialog`: do not await the command
    // execution itself, only the dialog that results from it.
    void page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('jupyterlite-webmcp:add-comment')
    );
    await page.waitForSelector('.jp-Dialog');
    await page.locator('.jp-Dialog input').fill('Please rename this variable.');
    await page.locator('.jp-Dialog .jp-mod-accept').click();
    await page.waitForSelector('.jp-Dialog', { state: 'detached' });

    const list = await callTool(page, 'jupyter_list_comments', { status: 'all' });
    const summary = list.payload.threads.find(
      (t: any) => t.anchor?.cellId === cellId && t.anchor?.kind === 'source-range'
    );
    expect(summary).toBeTruthy();
    expect(summary.anchor.selectedText).toBe('total = 1 + 2');

    const full = await callTool(page, 'jupyter_get_comment', { threadId: summary.threadId });
    expect(full.ok).toBe(true);
    expect(full.payload.thread.anchor.kind).toBe('source-range');
    expect(full.payload.thread.messages[0].author.kind).toBe('human');
    expect(full.payload.thread.messages[0].body).toBe('Please rename this variable.');

    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('a human replies through the real Review panel UI', async () => {
    await openNotebook(page, 'scratch.ipynb');
    const uniqueMessage = `agent thread ${Date.now()}`;
    const inserted = await callTool(page, 'jupyter_insert_cell', {
      cellType: 'code',
      source: 'reply_target = True'
    });
    const cellId = inserted.payload.cell.id;
    const created = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'cell', cellId },
      message: uniqueMessage
    });
    expect(created.ok).toBe(true);
    const threadId = created.payload.thread.id;
    const beforeMessages = created.payload.thread.messages;

    await page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('jupyterlite-webmcp:open-review')
    );
    const panel = page.locator('.jp-webmcp-Comments');
    await expect(panel).toBeVisible();
    const threadCard = panel.locator('.jp-webmcp-thread', { hasText: uniqueMessage });
    await expect(threadCard).toBeVisible();

    await threadCard.locator('button', { hasText: 'Reply' }).click();
    await page.waitForSelector('.jp-Dialog');
    await page.locator('.jp-Dialog input').fill('Human reply from the panel.');
    await page.locator('.jp-Dialog .jp-mod-accept').click();
    await page.waitForSelector('.jp-Dialog', { state: 'detached' });

    const after = await callTool(page, 'jupyter_get_comment', { threadId });
    expect(after.ok).toBe(true);
    const messages = after.payload.thread.messages;
    expect(messages.length).toBe(beforeMessages.length + 1);
    for (let i = 0; i < beforeMessages.length; i++) {
      expect(messages[i].id).toBe(beforeMessages[i].id);
      expect(messages[i].body).toBe(beforeMessages[i].body);
    }
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.author.kind).toBe('human');
    expect(lastMessage.body).toBe('Human reply from the panel.');

    await openNotebook(page, 'customer-analysis.ipynb');
  });

  test('a hidden cell also hides its review thread from the agent', async () => {
    await page.evaluate(() => {
      const panel = (window as any).jupyterapp.shell.currentWidget;
      const cells = panel.context.model.cells;
      for (let i = 0; i < cells.length; i++) {
        if (cells.get(i).id === 'conversion-rate') {
          panel.content.activeCellIndex = i;
          return;
        }
      }
      throw new Error('conversion-rate cell missing');
    });

    // This is the normal human-only command: editable -> read-only -> hidden.
    await page.evaluate(async () => {
      const commands = (window as any).jupyterapp.commands;
      await commands.execute('jupyterlite-webmcp:cycle-cell-access');
      await commands.execute('jupyterlite-webmcp:cycle-cell-access');
    });

    const hiddenThread = await callTool(page, 'jupyter_get_comment', {
      threadId: sourceRangeThreadId
    });
    expect(hiddenThread.ok).toBe(false);
    expect(hiddenThread.payload.error).toBe('CELL_NOT_FOUND');

    const listed = await callTool(page, 'jupyter_list_comments', { status: 'all' });
    expect(listed.ok).toBe(true);
    expect(listed.payload.threads.map((thread: any) => thread.threadId)).not.toContain(
      sourceRangeThreadId
    );

    const blockedCreate = await callTool(page, 'jupyter_create_comment', {
      anchor: { kind: 'cell', cellId: 'conversion-rate' },
      message: 'This must not disclose a hidden cell.'
    });
    expect(blockedCreate.ok).toBe(false);
    expect(blockedCreate.payload.error).toBe('CELL_NOT_FOUND');

    // Restore the ordinary default before this shared page is closed.
    await page.evaluate(() =>
      (window as any).jupyterapp.commands.execute('jupyterlite-webmcp:cycle-cell-access')
    );
  });
});

/**
 * Same reasoning as `tests/unit/stale.spec.ts`, with one addition: unlike
 * Direct mode, Propose mode's accept path re-resolves the notebook by its
 * concrete path (`proposal.notebookPath`, always non-empty — see
 * `src/propose/tools.ts`), which routes through `resolveNotebook`'s
 * "path provided" branch and its `widget instanceof NotebookPanel` check.
 * So unlike `stale.spec.ts`, that check *is* reachable here — the fake
 * `NotebookPanel` mock below is trivial (`class {}`), but the fake panel is
 * still constructed via `new NotebookPanel()` so the check passes exactly
 * as it would for a real one.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { NotebookPanel } from '@jupyterlab/notebook';
import { ToolError } from '../../src/jupyter/errors';
import { hashCellSource } from '../../src/jupyter/revisions';
import type { IJupyterEnv } from '../../src/jupyter/workspace';
import { proposeUpdateCell } from '../../src/propose/tools';
import { ProposeStore } from '../../src/propose/store';

interface IFakeCell {
  id: string;
  type: string;
  sharedModel: {
    getSource: () => string;
    setSource: (source: string) => void;
    toJSON: () => { metadata?: Record<string, unknown>; outputs?: unknown[] };
  };
}

function makeCell(id: string, type: string, source: string): IFakeCell {
  let current = source;
  return {
    id,
    type,
    sharedModel: {
      getSource: () => current,
      setSource: (next: string) => {
        current = next;
      },
      toJSON: () => ({ metadata: {}, outputs: [] })
    }
  };
}

function makeEnv(cells: IFakeCell[]): { env: IJupyterEnv; cells: IFakeCell[] } {
  const model = {
    dirty: false,
    cells: {
      get length() {
        return cells.length;
      },
      get: (index: number) => cells[index]
    },
    sharedModel: {
      deleteCell: (index: number) => {
        cells.splice(index, 1);
      }
    }
  };

  const panel = Object.assign(
    new (NotebookPanel as unknown as new () => NotebookPanel)(),
    {
      context: {
        ready: Promise.resolve(),
        path: 'notebook.ipynb',
        model
      },
      content: {
        activeCell: null
      }
    }
  );

  const env = {
    app: {} as unknown,
    // `proposeUpdateCell`'s accept path re-resolves the notebook by the
    // concrete path captured on the proposal (`proposal.notebookPath`,
    // always a real, non-empty workspace path — see `src/propose/tools.ts`),
    // which routes through `resolveNotebook`'s "path provided" branch. That
    // branch looks the already-open widget up via `docManager.findWidget`
    // exactly as any other explicit-`notebookPath` tool call would.
    docManager: {
      findWidget: (path: string) =>
        path === panel.context.path ? panel : undefined
    } as unknown,
    tracker: { currentWidget: panel as unknown },
    fileBrowser: null
  } as unknown as IJupyterEnv;

  return { env, cells };
}

/**
 * Waits for every currently-queued microtask (and the macrotask boundary
 * itself) to run before returning, so a test can safely assume
 * `proposeUpdateCell`'s internal `await`s (`resolveNotebook`'s own awaits
 * included) have all settled and the pending proposal genuinely exists. A
 * single `await Promise.resolve()` is not enough: `resolveNotebook` alone
 * awaits `panel.context.ready` before `proposeUpdateCell` reaches the point
 * of creating a proposal, so checking `pendingFor` too early would see
 * `null` and any mutation made "before propose" would in fact land after
 * `proposeUpdateCell`'s own freshness check runs.
 */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('proposeUpdateCell', () => {
  it('does not apply the write until the human accepts, then applies it through updateCell', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();
    const hash = hashCellSource('code', source);

    const call = proposeUpdateCell(env, store, {
      cellId,
      source: 'print(2)',
      expectedSourceHash: hash
    });

    // The write must not have landed yet: the tool call is genuinely
    // pending on a human decision.
    await flush();
    expect(cells[0].sharedModel.getSource()).toBe(source);

    const pending = store.pendingFor({
      notebookPath: 'notebook.ipynb',
      cellId
    });
    expect(pending).not.toBeNull();
    expect(pending!.before).toBe(source);
    expect(pending!.after).toBe('print(2)');

    store.accept(pending!.id);
    const result = await call;

    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.cell.source).toBe('print(2)');
      expect(result.proposalId).toBe(pending!.id);
    }
    expect(cells[0].sharedModel.getSource()).toBe('print(2)');
  });

  it('a denial resolves as a non-error result carrying the human reason, and never applies the write', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();
    const hash = hashCellSource('code', source);

    const call = proposeUpdateCell(env, store, {
      cellId,
      source: 'print(2)',
      expectedSourceHash: hash
    });

    await flush();
    const pending = store.pendingFor({
      notebookPath: 'notebook.ipynb',
      cellId
    })!;
    store.deny(pending.id, 'Not while the pipeline is running.');

    const result = await call;
    expect(result.status).toBe('denied');
    if (result.status === 'denied') {
      expect(result.code).toBe('PROPOSAL_DENIED');
      expect(result.reason).toBe('Not while the pipeline is running.');
      expect(result.cellId).toBe(cellId);
    }
    expect(cells[0].sharedModel.getSource()).toBe(source);
  });

  it('a denial with no reason resolves with reason: null', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();
    const hash = hashCellSource('code', source);

    const call = proposeUpdateCell(env, store, {
      cellId,
      source: 'print(2)',
      expectedSourceHash: hash
    });
    await flush();
    const pending = store.pendingFor({
      notebookPath: 'notebook.ipynb',
      cellId
    })!;
    store.deny(pending.id);

    const result = await call;
    expect(result.status).toBe('denied');
    if (result.status === 'denied') {
      expect(result.reason).toBeNull();
    }
  });

  it('a stale sourceHash is refused immediately, before any proposal is created', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();

    let caught: unknown;
    try {
      await proposeUpdateCell(env, store, {
        cellId,
        source: 'print(2)',
        expectedSourceHash: 'not-the-real-hash'
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('STALE_CELL');
    expect(
      store.pendingFor({ notebookPath: 'notebook.ipynb', cellId })
    ).toBeNull();
    expect(store.proposals).toHaveLength(0);
  });

  it('a second proposal on the same still-pending cell is refused with PROPOSAL_ALREADY_PENDING', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();
    const hash = hashCellSource('code', source);

    const first = proposeUpdateCell(env, store, {
      cellId,
      source: 'print(2)',
      expectedSourceHash: hash
    });
    await flush();

    let caught: unknown;
    try {
      await proposeUpdateCell(env, store, {
        cellId,
        source: 'print(3)',
        expectedSourceHash: hash
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('PROPOSAL_ALREADY_PENDING');

    // Clean up the still-pending first call so the test does not leak a
    // dangling unhandled promise.
    const pending = store.pendingFor({
      notebookPath: 'notebook.ipynb',
      cellId
    })!;
    store.deny(pending.id);
    await first;
  });

  it('aborting the signal rejects the pending call with ABORTED, without applying the write', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();
    const hash = hashCellSource('code', source);
    const controller = new AbortController();

    const call = proposeUpdateCell(
      env,
      store,
      { cellId, source: 'print(2)', expectedSourceHash: hash },
      controller.signal
    );
    await flush();
    controller.abort();

    let caught: unknown;
    try {
      await call;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('ABORTED');
    expect(cells[0].sharedModel.getSource()).toBe(source);
  });

  it('CRITICAL: re-checks the sourceHash on accept, so a human edit made while the proposal was pending still wins', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const store = new ProposeStore();
    const hash = hashCellSource('code', source);

    const call = proposeUpdateCell(env, store, {
      cellId,
      source: 'print(2)',
      expectedSourceHash: hash
    });
    await flush();
    const pending = store.pendingFor({
      notebookPath: 'notebook.ipynb',
      cellId
    })!;

    // The human edits the cell by hand while the proposal is sitting there
    // awaiting review — exactly the scenario `sourceHash` exists to guard.
    cells[0].sharedModel.setSource('print("human edit")');

    store.accept(pending.id);

    let caught: unknown;
    try {
      await call;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('STALE_CELL');
    expect(cells[0].sharedModel.getSource()).toBe('print("human edit")');
  });
});

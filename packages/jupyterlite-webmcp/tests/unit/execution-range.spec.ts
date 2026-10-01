/**
 * These tests exercise the selector and access preflight in the execution
 * module without requiring a JupyterLab runtime. The execution primitive only
 * needs the small model/panel surface represented by the fakes below;
 * CodeCell.execute is mocked so the tests stay deterministic and never
 * contact a kernel.
 */
jest.mock('@jupyterlab/cells', () => ({
  CodeCell: class {},
  MarkdownCell: class {}
}));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { CodeCell } from '@jupyterlab/cells';

import { runCells } from '../../src/jupyter/execution';
import { ToolError } from '../../src/jupyter/errors';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

interface IFakeCell {
  id: string;
  type: string;
  sharedModel: {
    getSource: () => string;
    getMetadata: (key: string) => unknown;
    setMetadata: (key: string, value: unknown) => void;
    deleteMetadata: (key: string) => void;
    transact: (f: () => void, undoable?: boolean) => void;
    toJSON: () => { metadata?: Record<string, unknown>; outputs?: unknown[] };
  };
  executionCount?: number | null;
}

function makeCell(
  id: string,
  source: string,
  metadata: Record<string, unknown> = {}
): IFakeCell {
  let cellMetadata = { ...metadata };
  return {
    id,
    type: 'code',
    sharedModel: {
      getSource: () => source,
      getMetadata: key => cellMetadata[key],
      setMetadata: (key, value) => {
        cellMetadata = { ...cellMetadata, [key]: value };
      },
      deleteMetadata: key => {
        const next = { ...cellMetadata };
        delete next[key];
        cellMetadata = next;
      },
      transact: f => f(),
      toJSON: () => ({ metadata: cellMetadata, outputs: [] })
    },
    executionCount: null
  };
}

function makeCodeWidget(model: IFakeCell): { model: IFakeCell } {
  const widget = Object.create(CodeCell.prototype) as { model: IFakeCell };
  widget.model = model;
  return widget;
}

function makeEnv(
  cells: IFakeCell[],
  activeCellIndex = 0
): {
  env: IJupyterEnv;
  execute: jest.Mock;
  widgets: { model: IFakeCell }[];
  interrupt: jest.Mock;
} {
  const model = {
    dirty: false,
    cells: {
      get length() {
        return cells.length;
      },
      get: (index: number) => cells[index]
    }
  };
  const widgets = cells.map(makeCodeWidget);
  const interrupt = jest.fn().mockResolvedValue(undefined);
  const panel = {
    context: { ready: Promise.resolve(), path: '/notebook.ipynb', model },
    content: { activeCellIndex, widgets },
    sessionContext: {
      ready: Promise.resolve(),
      session: { kernel: { interrupt } }
    }
  };
  const execute = jest.fn().mockResolvedValue({ content: { status: 'ok' } });
  (CodeCell as unknown as { execute: jest.Mock }).execute = execute;
  const env = {
    app: {} as unknown,
    docManager: {} as unknown,
    tracker: { currentWidget: panel as unknown },
    fileBrowser: null
  } as unknown as IJupyterEnv;
  return { env, execute, widgets, interrupt };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ToolError ? error.code : undefined;
}

describe('jupyter_run_cells contiguous ranges', () => {
  it('runs a range in notebook order and returns ordered results', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('second', 'print(2)'),
      makeCell('third', 'print(3)')
    ];
    const { env, execute } = makeEnv(cells);

    const result = await runCells(env, { startIndex: 0, endIndex: 3 });

    expect(result.status).toBe('ok');
    expect(result.results.map(cell => cell.cellId)).toEqual([
      'first',
      'second',
      'third'
    ]);
    expect(result.results.map(cell => cell.index)).toEqual([0, 1, 2]);
    expect(execute.mock.calls.map(call => call[0].model.id)).toEqual([
      'first',
      'second',
      'third'
    ]);
  });

  it('preflights every range cell and does not partially run on read-only access', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('read-only', 'print(2)', {
        jupyterlite_webmcp: { access: 'read' }
      }),
      makeCell('third', 'print(3)')
    ];
    const { env, execute } = makeEnv(cells);

    let caught: unknown;
    try {
      await runCells(env, { startIndex: 0, endIndex: 3 });
    } catch (error) {
      caught = error;
    }

    expect(errorCode(caught)).toBe('CELL_ACCESS_DENIED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('treats hidden cells in an explicit range as not found', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('hidden', 'print(2)', {
        jupyterlite_webmcp: { access: 'none' }
      })
    ];
    const { env, execute } = makeEnv(cells);

    let caught: unknown;
    try {
      await runCells(env, { startIndex: 0, endIndex: 2 });
    } catch (error) {
      caught = error;
    }

    expect(errorCode(caught)).toBe('CELL_NOT_FOUND');
    // The agent addressed the cell by position, so its real id must not leak.
    expect(JSON.stringify(caught)).not.toContain('hidden');
    expect(String((caught as Error).message)).not.toContain('"hidden"');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [{ startIndex: 0 }, 'INVALID_ARGUMENT'],
    [{ endIndex: 2 }, 'INVALID_ARGUMENT'],
    [{ startIndex: -1, endIndex: 2 }, 'INVALID_ARGUMENT'],
    [{ startIndex: 0, endIndex: 1.5 }, 'INVALID_ARGUMENT'],
    [{ startIndex: 2, endIndex: 1 }, 'INVALID_ARGUMENT'],
    [{ startIndex: 0, endIndex: 101 }, 'INVALID_ARGUMENT'],
    [{ cellIds: ['first'], startIndex: 0, endIndex: 1 }, 'INVALID_ARGUMENT']
  ])('rejects malformed range selector %#', async (params, expected) => {
    const { env } = makeEnv([makeCell('first', 'print(1)')]);
    let caught: unknown;
    try {
      await runCells(env, params);
    } catch (error) {
      caught = error;
    }
    expect(errorCode(caught)).toBe(expected);
  });
});

describe('jupyter_run_cells re-resolves targets by id while running', () => {
  function insertHiddenAbove(
    cells: IFakeCell[],
    widgets: { model: IFakeCell }[]
  ): void {
    const hidden = makeCell('hidden', 'leak = "SECRET"', {
      jupyterlite_webmcp: { access: 'none' }
    });
    cells.splice(0, 0, hidden);
    widgets.splice(0, 0, makeCodeWidget(hidden));
  }

  it('runs the right cell when the human inserts a hidden cell above mid-run', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('second', 'print(2)')
    ];
    const { env, execute, widgets } = makeEnv(cells);
    execute.mockImplementationOnce(async () => {
      insertHiddenAbove(cells, widgets);
      return { content: { status: 'ok' } };
    });

    const result = await runCells(env, { cellIds: ['first', 'second'] });

    expect(execute.mock.calls.map(call => call[0].model.id)).toEqual([
      'first',
      'second'
    ]);
    expect(result.results.map(r => [r.cellId, r.index])).toEqual([
      ['first', 0],
      ['second', 2]
    ]);
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('reports a deleted and a newly hidden target identically, and never runs them', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('doomed', 'print(2)'),
      makeCell('restricted', 'print(3)')
    ];
    const { env, execute, widgets } = makeEnv(cells);
    execute.mockImplementationOnce(async () => {
      cells.splice(1, 1);
      widgets.splice(1, 1);
      cells[1].sharedModel.setMetadata('jupyterlite_webmcp', {
        access: 'none'
      });
      return { content: { status: 'ok' } };
    });

    const result = await runCells(env, { startIndex: 0, endIndex: 3 });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    const [, deleted, hidden] = result.results;
    expect(deleted).toEqual(hidden);
    expect(deleted.status).toBe('no-op');
    expect(deleted.index).toBe(-1);
    // A positional selector never echoes an id the agent did not supply.
    expect(deleted.cellId).toBe('');
    expect(JSON.stringify(result)).not.toContain('restricted');
  });

  it('skips a target that became read-only without running it', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('second', 'print(2)')
    ];
    const { env, execute } = makeEnv(cells);
    execute.mockImplementationOnce(async () => {
      cells[1].sharedModel.setMetadata('jupyterlite_webmcp', {
        access: 'read'
      });
      return { content: { status: 'ok' } };
    });

    const result = await runCells(env, { cellIds: ['first', 'second'] });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.results[1]).toMatchObject({
      cellId: 'second',
      index: 1,
      status: 'no-op'
    });
  });

  it('returns nothing about a cell hidden while it was running', async () => {
    const cells = [makeCell('first', 'print(1)')];
    const { env, execute } = makeEnv(cells);
    execute.mockImplementationOnce(async () => {
      cells[0].sharedModel.setMetadata('jupyterlite_webmcp', {
        access: 'none'
      });
      return {
        content: {
          status: 'error',
          ename: 'E',
          evalue: 'SECRET',
          traceback: []
        }
      };
    });

    const result = await runCells(env, { cellIds: ['first'] });

    expect(result.results[0]).toMatchObject({ index: -1, status: 'no-op' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
});

describe('jupyter_run_cells abort handling', () => {
  it('reports aborted overall and abort entries for unrun cells even when the interrupted cell errors', async () => {
    const cells = [
      makeCell('first', 'print(1)'),
      makeCell('second', 'print(2)'),
      makeCell('third', 'print(3)')
    ];
    const { env, execute, interrupt } = makeEnv(cells);
    const controller = new AbortController();
    execute.mockImplementationOnce(async () => {
      controller.abort();
      return {
        content: {
          status: 'error',
          ename: 'KeyboardInterrupt',
          evalue: '',
          traceback: []
        }
      };
    });

    const result = await runCells(
      env,
      { cellIds: ['first', 'second', 'third'], stopOnError: true },
      controller.signal
    );

    expect(interrupt).toHaveBeenCalled();
    expect(result.status).toBe('aborted');
    expect(result.results.map(r => r.status)).toEqual([
      'error',
      'abort',
      'abort'
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

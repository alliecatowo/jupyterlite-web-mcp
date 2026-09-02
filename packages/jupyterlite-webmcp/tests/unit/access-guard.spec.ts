/**
 * See `tests/unit/stale.spec.ts` for why these two JupyterLab packages are
 * mocked rather than imported for real: `src/jupyter/cells.ts` uses
 * `MarkdownCell`/`NotebookPanel` in `instanceof` checks that are never
 * reached by the paths these tests exercise.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { getCellAccess, getCells, updateCell } from '../../src/jupyter/cells';
import { ToolError } from '../../src/jupyter/errors';
import { hashCellSource } from '../../src/jupyter/revisions';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

interface IFakeCell {
  id: string;
  type: string;
  sharedModel: {
    getSource: () => string;
    setSource: (source: string) => void;
    toJSON: () => { metadata?: Record<string, unknown>; outputs?: unknown[] };
    getMetadata: (key: string) => unknown;
    setMetadata: (key: string, value: unknown) => void;
    deleteMetadata: (key: string) => void;
    transact: (f: () => void, undoable?: boolean) => void;
  };
}

function makeCell(
  id: string,
  type: string,
  source: string,
  metadata: Record<string, unknown> = {}
): IFakeCell {
  let current = source;
  let meta: Record<string, unknown> = { ...metadata };
  return {
    id,
    type,
    sharedModel: {
      getSource: () => current,
      setSource: next => {
        current = next;
      },
      toJSON: () => ({ metadata: meta, outputs: [] }),
      getMetadata: key => meta[key],
      setMetadata: (key, value) => {
        meta = { ...meta, [key]: value };
      },
      deleteMetadata: key => {
        const rest = { ...meta };
        delete rest[key];
        meta = rest;
      },
      transact: f => f()
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

  const panel = {
    context: {
      ready: Promise.resolve(),
      path: '/notebook.ipynb',
      model
    },
    content: {
      activeCell: null,
      activeCellIndex: 0
    }
  };

  const env = {
    app: {} as unknown,
    docManager: {} as unknown,
    tracker: { currentWidget: panel as unknown },
    fileBrowser: null
  } as unknown as IJupyterEnv;

  return { env, cells };
}

function threeCells(): IFakeCell[] {
  return [
    makeCell('cell-write', 'code', 'print(1)'),
    makeCell('cell-none', 'code', 'secret()', {
      jupyterlite_webmcp: { access: 'none' }
    }),
    makeCell('cell-read', 'code', 'print(3)', {
      jupyterlite_webmcp: { access: 'read' }
    })
  ];
}

describe('getCells: hidden cells are omitted, not silently', () => {
  it('omits a "none" cell from a range read and reports hiddenCellCount', async () => {
    const { env } = makeEnv(threeCells());

    const result = await getCells(env, { startIndex: 0, endIndex: 3 });

    expect(result.cells.map(c => c.id)).toEqual(['cell-write', 'cell-read']);
    expect(result.hiddenCellCount).toBe(1);
    expect(result.omittedCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('reports hiddenCellCount: 0 when nothing is hidden', async () => {
    const { env } = makeEnv([makeCell('c1', 'code', 'x')]);
    const result = await getCells(env, {});
    expect(result.hiddenCellCount).toBe(0);
  });

  it('CELL_NOT_FOUND for an explicit id that is "none"-access: unprobeable', async () => {
    const { env } = makeEnv(threeCells());

    let caught: unknown;
    try {
      await getCells(env, { cellIds: ['cell-none'] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('CELL_NOT_FOUND');
  });

  it('returns a "read"-access cell fine for an explicit id', async () => {
    const { env } = makeEnv(threeCells());
    const result = await getCells(env, { cellIds: ['cell-read'] });
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].id).toBe('cell-read');
  });
});

describe('requireCellIndex access policy, via updateCell', () => {
  it('CELL_ACCESS_DENIED when writing a "read"-access cell', async () => {
    const { env } = makeEnv(threeCells());
    const expectedSourceHash = hashCellSource('code', 'print(3)');

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId: 'cell-read',
        source: 'print(4)',
        expectedSourceHash
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    const err = caught as ToolError;
    expect(err.code).toBe('CELL_ACCESS_DENIED');
    const json = err.toJSON();
    expect(json.cellId).toBe('cell-read');
    expect(json.access).toBe('read');
  });

  it('CELL_NOT_FOUND (never CELL_ACCESS_DENIED) when writing a "none"-access cell', async () => {
    const { env } = makeEnv(threeCells());
    const expectedSourceHash = hashCellSource('code', 'secret()');

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId: 'cell-none',
        source: 'other()',
        expectedSourceHash
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('CELL_NOT_FOUND');
  });

  it('succeeds for a "write"-access (default) cell and records agent provenance', async () => {
    const { env, cells } = makeEnv(threeCells());
    const expectedSourceHash = hashCellSource('code', 'print(1)');

    const result = await updateCell(env, {
      cellId: 'cell-write',
      source: 'print(2)',
      expectedSourceHash
    });

    expect(result.cell.source).toBe('print(2)');
    expect(result.cell.lastEditedBy).toBe('agent');
    expect(result.cell.lastEditedAt).toEqual(expect.any(String));

    const metadata = cells[0].sharedModel.getMetadata('jupyterlite_webmcp') as {
      history?: Array<{ actor: string; action: string; tool?: string }>;
    };
    expect(metadata.history).toHaveLength(1);
    expect(metadata.history?.[0]).toMatchObject({
      actor: 'agent',
      action: 'edited',
      tool: 'jupyter_update_cell'
    });
  });
});

describe('getCellAccess', () => {
  it('reports the access level of visible cells and the hidden count', async () => {
    const { env } = makeEnv(threeCells());
    const result = await getCellAccess(env, {});

    expect(result.hiddenCellCount).toBe(1);
    expect(
      result.cells.map(c => ({ cellId: c.cellId, access: c.access }))
    ).toEqual([
      { cellId: 'cell-write', access: 'write' },
      { cellId: 'cell-read', access: 'read' }
    ]);
  });

  it('CELL_NOT_FOUND for an explicit "none" cell id, same as every other path', async () => {
    const { env } = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCellAccess(env, { cellIds: ['cell-none'] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('CELL_NOT_FOUND');
  });
});

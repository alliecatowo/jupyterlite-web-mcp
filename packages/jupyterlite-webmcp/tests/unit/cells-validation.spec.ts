/**
 * Regression coverage for the live-tested contract-hardening defect: a
 * handler must reject an out-of-range argument rather than silently
 * clamping it, even though the advertised JSON schema declares `minimum: 0`
 * (see `docs/agent-collaboration-roadmap.md`, "Contract hardening", and
 * `docs/webmcp-tools.md`). See `tests/unit/derive.spec.ts` for why
 * `@jupyterlab/cells`/`@jupyterlab/notebook` are mocked rather than imported
 * for real.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import {
  exportNotebook,
  getCellAccess,
  getCells,
  insertCell,
  updateCell
} from '../../src/jupyter/cells';
import { ToolError } from '../../src/jupyter/errors';
import { LIMITS } from '../../src/limits';
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

function makeCell(id: string, type: string, source: string): IFakeCell {
  let current = source;
  return {
    id,
    type,
    sharedModel: {
      getSource: () => current,
      setSource: next => {
        current = next;
      },
      toJSON: () => ({ metadata: {}, outputs: [] }),
      getMetadata: () => undefined,
      setMetadata: () => undefined,
      deleteMetadata: () => undefined,
      transact: f => f()
    }
  };
}

function makeEnv(cells: IFakeCell[]): IJupyterEnv {
  const model = {
    dirty: false,
    cells: {
      get length() {
        return cells.length;
      },
      get: (index: number) => cells[index]
    },
    sharedModel: {
      insertCell: (
        index: number,
        spec: { cell_type: string; source: string; metadata: unknown }
      ) => {
        cells.splice(
          index,
          0,
          makeCell(`new-${cells.length}`, spec.cell_type, spec.source)
        );
      },
      deleteCell: (index: number) => {
        cells.splice(index, 1);
      }
    }
  };
  const panel = {
    context: { ready: Promise.resolve(), path: '/notebook.ipynb', model },
    content: { activeCell: null, activeCellIndex: 0, widgets: cells }
  };
  return {
    app: {} as unknown,
    docManager: {} as unknown,
    tracker: { currentWidget: panel as unknown },
    fileBrowser: null
  } as unknown as IJupyterEnv;
}

function threeCells(): IFakeCell[] {
  return [
    makeCell('a', 'code', 'print(1)'),
    makeCell('b', 'code', 'print(2)'),
    makeCell('c', 'code', 'print(3)')
  ];
}

describe('getCells: rejects out-of-range arguments rather than clamping', () => {
  it('rejects a negative startIndex with INVALID_ARGUMENT, does not clamp to 0', async () => {
    const env = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCells(env, { startIndex: -1 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('rejects a negative endIndex', async () => {
    const env = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCells(env, { endIndex: -5 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('rejects endIndex < startIndex', async () => {
    const env = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCells(env, { startIndex: 2, endIndex: 1 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('rejects a non-integer startIndex', async () => {
    const env = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCells(env, { startIndex: 1.5 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('accepts a valid range', async () => {
    const env = makeEnv(threeCells());
    const result = await getCells(env, { startIndex: 0, endIndex: 2 });
    expect(result.cells).toHaveLength(2);
  });

  it('rejects an empty cellIds array instead of silently reading a range', async () => {
    const env = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCells(env, { cellIds: [] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('rejects a cellIds array over the per-call cap', async () => {
    const env = makeEnv(threeCells());
    const tooMany = Array.from(
      { length: LIMITS.MAX_CELL_IDS_PER_CALL + 1 },
      (_, i) => `id-${i}`
    );
    let caught: unknown;
    try {
      await getCells(env, { cellIds: tooMany });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });
});

describe('getCellAccess: same range validation as getCells', () => {
  it('rejects a negative startIndex', async () => {
    const env = makeEnv(threeCells());
    let caught: unknown;
    try {
      await getCellAccess(env, { startIndex: -1 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });
});

describe('source-size validation on writes', () => {
  it('updateCell rejects a source over MAX_CELL_SOURCE_WRITE_BYTES', async () => {
    const env = makeEnv(threeCells());
    const oversized = 'x'.repeat(LIMITS.MAX_CELL_SOURCE_WRITE_BYTES + 1);
    let caught: unknown;
    try {
      await updateCell(env, {
        cellId: 'a',
        source: oversized,
        expectedSourceHash: hashCellSource('code', 'print(1)')
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('insertCell rejects a source over MAX_CELL_SOURCE_WRITE_BYTES', async () => {
    const env = makeEnv(threeCells());
    const oversized = 'x'.repeat(LIMITS.MAX_CELL_SOURCE_WRITE_BYTES + 1);
    let caught: unknown;
    try {
      await insertCell(env, { source: oversized, activate: false });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });
});

describe('exportNotebook', () => {
  it('renders visible cells and reports cellCount/hiddenCellCount', async () => {
    const env = makeEnv(threeCells());
    const result = await exportNotebook(env, {});
    expect(result.cellCount).toBe(3);
    expect(result.hiddenCellCount).toBe(0);
    expect(result.document).toContain('print(1)');
    expect(result.notebookPath).toBe('/notebook.ipynb');
  });

  it('omits a "none"-access cell entirely and reports hiddenCellCount', async () => {
    const cells = threeCells();
    (cells[1].sharedModel.getMetadata as unknown) = (key: string) =>
      key === 'jupyterlite_webmcp' ? { access: 'none' } : undefined;
    const env = makeEnv(cells);
    const result = await exportNotebook(env, {});
    expect(result.cellCount).toBe(2);
    expect(result.hiddenCellCount).toBe(1);
    expect(result.document).not.toContain('print(2)');
  });
});

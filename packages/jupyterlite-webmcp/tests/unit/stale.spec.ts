/**
 * `src/jupyter/cells.ts` (and, transitively, `src/jupyter/notebook.ts`) each
 * use one JupyterLab class as a real runtime value (`MarkdownCell` in an
 * `instanceof` check in `insertCell`, `NotebookPanel` in an `instanceof`
 * check in `resolveNotebook`), so importing the module at all pulls in the
 * real `@jupyterlab/cells` / `@jupyterlab/notebook` ESM packages, which Jest
 * cannot parse under this project's CommonJS test config. Neither check is
 * reachable from the `updateCell`/`deleteCell` paths these tests exercise
 * (path is always omitted here, so `resolveNotebook` returns
 * `env.tracker.currentWidget` directly without an `instanceof` check), so a
 * trivial mock is enough to let the module load.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { updateCell, deleteCell } from '../../src/jupyter/cells';
import { ToolError } from '../../src/jupyter/errors';
import { hashCellSource } from '../../src/jupyter/revisions';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

/**
 * Minimal hand-written fakes of the JupyterLab objects `updateCell` and
 * `deleteCell` touch. No JupyterLab modules are imported for real: only the
 * shapes `src/jupyter/cells.ts` and `src/jupyter/notebook.ts` actually read
 * from.
 */

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

function makeEnv(cells: IFakeCell[]): {
  env: IJupyterEnv;
  cells: IFakeCell[];
} {
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
      activeCell: null
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

describe('updateCell staleness', () => {
  it('succeeds and changes the source when the hash matches', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env } = makeEnv([makeCell(cellId, 'code', source)]);
    const expectedSourceHash = hashCellSource('code', source);

    const result = await updateCell(env, {
      cellId,
      source: 'print(2)',
      expectedSourceHash
    });

    expect(result.cell.source).toBe('print(2)');
  });

  it('throws STALE_CELL with a structured payload and leaves the source untouched when the hash is stale', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const staleHash = hashCellSource('code', 'some other source');

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId,
        source: 'print(2)',
        expectedSourceHash: staleHash
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    const err = caught as ToolError;
    expect(err.code).toBe('STALE_CELL');
    const json = err.toJSON();
    expect(json.cellId).toBe(cellId);
    expect(json.expectedSourceHash).toBe(staleHash);
    expect(json.currentSourceHash).toBe(hashCellSource('code', source));
    expect(json.currentSourcePreview).toBe(source);

    expect(cells[0].sharedModel.getSource()).toBe(source);
  });

  it('bounds a long currentSourcePreview', async () => {
    const cellId = 'cell-1';
    const longSource = 'x'.repeat(1000);
    const { env } = makeEnv([makeCell(cellId, 'code', longSource)]);

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId,
        source: 'irrelevant',
        expectedSourceHash: 'not-the-real-hash'
      });
    } catch (error) {
      caught = error;
    }

    const err = caught as ToolError;
    expect(err.code).toBe('STALE_CELL');
    const preview = err.toJSON().currentSourcePreview as string;
    expect(preview.length).toBeLessThan(longSource.length);
    expect(preview).toBe(longSource.slice(0, preview.length));
  });

  it('throws INVALID_ARGUMENT when expectedSourceHash is missing', async () => {
    const cellId = 'cell-1';
    const { env } = makeEnv([makeCell(cellId, 'code', 'print(1)')]);

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId,
        source: 'print(2)',
        expectedSourceHash: undefined as unknown as string
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('throws INVALID_ARGUMENT when expectedSourceHash is an empty string', async () => {
    const cellId = 'cell-1';
    const { env } = makeEnv([makeCell(cellId, 'code', 'print(1)')]);

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId,
        source: 'print(2)',
        expectedSourceHash: ''
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('treats a hash as stale when only the cell type changed', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const validHashForCode = hashCellSource('code', source);
    // Same source, but the live cell is now a markdown cell: the hash must
    // no longer match, because `hashCellSource` folds the type in.
    const { env } = makeEnv([makeCell(cellId, 'markdown', source)]);

    let caught: unknown;
    try {
      await updateCell(env, {
        cellId,
        source: 'changed',
        expectedSourceHash: validHashForCode
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('STALE_CELL');
  });
});

describe('deleteCell staleness', () => {
  it('succeeds and removes the cell when the hash matches', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const expectedSourceHash = hashCellSource('code', source);

    const result = await deleteCell(env, { cellId, expectedSourceHash });

    expect(result.deletedCellId).toBe(cellId);
    expect(cells).toHaveLength(0);
  });

  it('throws STALE_CELL with a structured payload and does not remove the cell when the hash is stale', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const { env, cells } = makeEnv([makeCell(cellId, 'code', source)]);
    const staleHash = hashCellSource('code', 'some other source');

    let caught: unknown;
    try {
      await deleteCell(env, { cellId, expectedSourceHash: staleHash });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    const err = caught as ToolError;
    expect(err.code).toBe('STALE_CELL');
    const json = err.toJSON();
    expect(json.cellId).toBe(cellId);
    expect(json.expectedSourceHash).toBe(staleHash);
    expect(json.currentSourceHash).toBe(hashCellSource('code', source));
    expect(json.currentSourcePreview).toBe(source);

    expect(cells).toHaveLength(1);
    expect(cells[0].sharedModel.getSource()).toBe(source);
  });

  it('throws INVALID_ARGUMENT when expectedSourceHash is missing', async () => {
    const cellId = 'cell-1';
    const { env } = makeEnv([makeCell(cellId, 'code', 'print(1)')]);

    let caught: unknown;
    try {
      await deleteCell(env, {
        cellId,
        expectedSourceHash: undefined as unknown as string
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('throws INVALID_ARGUMENT when expectedSourceHash is an empty string', async () => {
    const cellId = 'cell-1';
    const { env } = makeEnv([makeCell(cellId, 'code', 'print(1)')]);

    let caught: unknown;
    try {
      await deleteCell(env, { cellId, expectedSourceHash: '' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
  });

  it('treats a hash as stale when only the cell type changed', async () => {
    const cellId = 'cell-1';
    const source = 'print(1)';
    const validHashForCode = hashCellSource('code', source);
    const { env, cells } = makeEnv([makeCell(cellId, 'markdown', source)]);

    let caught: unknown;
    try {
      await deleteCell(env, { cellId, expectedSourceHash: validHashForCode });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('STALE_CELL');
    expect(cells).toHaveLength(1);
  });
});

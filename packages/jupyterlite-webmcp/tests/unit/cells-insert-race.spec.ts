/**
 * `jupyter_insert_cell` snapshots the inserted cell by id, not by the index it
 * was inserted at, and cell source bounds count UTF-8 bytes. `revealCell` is
 * mocked so a test can simulate the human editing the notebook while the
 * insert awaits it.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));
jest.mock('../../src/jupyter/focus', () => ({ revealCell: jest.fn() }));

import {
  boundSource,
  checkSourceSize,
  insertCell
} from '../../src/jupyter/cells';
import { ToolError } from '../../src/jupyter/errors';
import { revealCell } from '../../src/jupyter/focus';
import { LIMITS } from '../../src/limits';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

interface IFakeCell {
  id: string;
  type: string;
  sharedModel: Record<string, unknown>;
}

function makeCell(
  id: string,
  source: string,
  metadata: Record<string, unknown> = {}
): IFakeCell {
  let meta = { ...metadata };
  return {
    id,
    type: 'code',
    sharedModel: {
      getSource: () => source,
      toJSON: () => ({ metadata: meta, outputs: [] }),
      getMetadata: (key: string) => meta[key],
      setMetadata: (key: string, value: unknown) => {
        meta = { ...meta, [key]: value };
      },
      deleteMetadata: (key: string) => {
        const next = { ...meta };
        delete next[key];
        meta = next;
      },
      transact: (f: () => void) => f()
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
      insertCell: (index: number, spec: { source: string }) => {
        cells.splice(index, 0, makeCell('inserted', spec.source));
      }
    }
  };
  const panel = {
    context: { ready: Promise.resolve(), path: 'n.ipynb', model },
    content: { activeCell: null, activeCellIndex: 0, widgets: cells }
  };
  return {
    app: {} as unknown,
    docManager: {} as unknown,
    tracker: { currentWidget: panel as unknown },
    fileBrowser: null
  } as unknown as IJupyterEnv;
}

describe('insertCell snapshots the new cell by id', () => {
  it('returns the inserted cell even if a hidden cell is inserted above it meanwhile', async () => {
    const cells = [makeCell('a', 'print(1)')];
    (revealCell as jest.Mock).mockImplementation(async () => {
      cells.splice(
        0,
        0,
        makeCell('secret', 'password = 1', {
          jupyterlite_webmcp: { access: 'none' }
        })
      );
      return null;
    });

    const result = await insertCell(makeEnv(cells), {
      referenceCellId: 'a',
      position: 'below',
      source: 'new()'
    });

    expect(result.cell.id).toBe('inserted');
    expect(result.cell.source).toBe('new()');
    expect(result.cell.index).toBe(2);
    expect(JSON.stringify(result)).not.toContain('password');
  });
});

describe('cell source bounds count UTF-8 bytes', () => {
  it('rejects a write whose UTF-8 size exceeds the limit even when its character count does not', () => {
    // 3 bytes per character: under the limit in characters, over it in bytes.
    const source = '日'.repeat(
      Math.floor(LIMITS.MAX_CELL_SOURCE_WRITE_BYTES / 2)
    );
    let caught: unknown;
    try {
      checkSourceSize(source);
    } catch (error) {
      caught = error;
    }
    expect((caught as ToolError).code).toBe('INVALID_ARGUMENT');
    expect(() =>
      checkSourceSize('x'.repeat(LIMITS.MAX_CELL_SOURCE_WRITE_BYTES))
    ).not.toThrow();
  });

  it('bounds a read to MAX_CELL_SOURCE_BYTES of UTF-8 without a marker', () => {
    const source = 'é'.repeat(LIMITS.MAX_CELL_SOURCE_BYTES);
    const bounded = boundSource(source);
    expect(bounded.truncated).toBe(true);
    expect(Buffer.byteLength(bounded.text, 'utf8')).toBeLessThanOrEqual(
      LIMITS.MAX_CELL_SOURCE_BYTES
    );
    expect(bounded.text).toBe('é'.repeat(LIMITS.MAX_CELL_SOURCE_BYTES / 2));
    expect(boundSource('short')).toEqual({ text: 'short', truncated: false });
  });
});

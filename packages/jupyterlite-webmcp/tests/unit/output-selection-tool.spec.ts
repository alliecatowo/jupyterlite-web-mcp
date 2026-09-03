/**
 * `jupyter_get_output_selection` must not become a leak around cell and
 * notebook access control: a selection inside something the owner hid from
 * the agent reads as "no selection". And `jupyter_update_cell` must refuse
 * a missing `source` instead of silently emptying the cell. The first lives
 * in `src/selection/visible.ts`, the second in `src/jupyter/cells.ts`, so
 * both are tested here with the same trivial `@jupyterlab/*` mocks the
 * other cell-level specs use (see `tests/unit/stale.spec.ts` for why).
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { NotebookPanel } from '@jupyterlab/notebook';

import { updateCell } from '../../src/jupyter/cells';
import { ToolError } from '../../src/jupyter/errors';
import type { IJupyterEnv } from '../../src/jupyter/workspace';
import type { IOutputSelection } from '../../src/selection/capture';
import { visibleOutputSelection } from '../../src/selection/visible';

function makeCell(id: string, access?: string): unknown {
  return {
    id,
    type: 'code',
    sharedModel: {
      getSource: () => 'source',
      getMetadata: (key: string) =>
        key === 'jupyterlite_webmcp' && access ? { access } : undefined
    }
  };
}

function makePanel(options: {
  cells: unknown[];
  notebookAccess?: string;
}): unknown {
  const cells = options.cells;
  const panel = Object.create(NotebookPanel.prototype);
  panel.context = {
    ready: Promise.resolve(),
    path: 'test.ipynb',
    model: {
      cells: {
        length: cells.length,
        get: (index: number) => cells[index]
      },
      sharedModel: {
        getMetadata: (key: string) =>
          key === 'jupyterlite_webmcp' && options.notebookAccess
            ? { notebookAccess: options.notebookAccess }
            : undefined
      }
    }
  };
  return panel;
}

function makeEnv(panel: unknown): IJupyterEnv {
  return { tracker: { currentWidget: panel } } as unknown as IJupyterEnv;
}

function makeRecord(cellId: string): IOutputSelection {
  return {
    cellId,
    outputIndex: 0,
    text: '42',
    outputFingerprint: 'fp',
    capturedAt: new Date().toISOString()
  };
}

describe('visibleOutputSelection', () => {
  it('returns the record for a visible cell', () => {
    const env = makeEnv(makePanel({ cells: [makeCell('a'), makeCell('b')] }));
    expect(visibleOutputSelection(env, makeRecord('b'))).toMatchObject({
      cellId: 'b',
      text: '42'
    });
  });

  it('returns null for a cell the owner hid from the agent', () => {
    const env = makeEnv(
      makePanel({ cells: [makeCell('a'), makeCell('hidden', 'none')] })
    );
    expect(visibleOutputSelection(env, makeRecord('hidden'))).toBeNull();
  });

  it('returns the record for a read-only cell (reads are permitted)', () => {
    const env = makeEnv(makePanel({ cells: [makeCell('r', 'read')] }));
    expect(visibleOutputSelection(env, makeRecord('r'))).toMatchObject({
      cellId: 'r'
    });
  });

  it('returns null when the current notebook itself is hidden', () => {
    const env = makeEnv(
      makePanel({ cells: [makeCell('a')], notebookAccess: 'none' })
    );
    expect(visibleOutputSelection(env, makeRecord('a'))).toBeNull();
  });

  it('returns null for a stale record the current notebook cannot verify', () => {
    const env = makeEnv(makePanel({ cells: [makeCell('a')] }));
    expect(visibleOutputSelection(env, makeRecord('elsewhere'))).toBeNull();
  });

  it('returns null when no notebook is open', () => {
    expect(visibleOutputSelection(makeEnv(null), makeRecord('a'))).toBeNull();
  });

  it('returns null when there is no record', () => {
    const env = makeEnv(makePanel({ cells: [makeCell('a')] }));
    expect(visibleOutputSelection(env, null)).toBeNull();
  });
});

describe('updateCell source validation', () => {
  it('refuses a missing source instead of emptying the cell', async () => {
    const env = makeEnv(makePanel({ cells: [makeCell('a')] }));
    let thrown: unknown = null;
    try {
      await updateCell(env, {
        cellId: 'a',
        source: undefined as unknown as string,
        expectedSourceHash: 'x'
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    expect((thrown as ToolError).code).toBe('INVALID_ARGUMENT');
  });
});

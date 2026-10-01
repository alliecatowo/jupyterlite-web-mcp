/**
 * `src/jupyter/focus.ts` transitively imports `src/jupyter/notebook.ts`,
 * which uses `NotebookPanel` as a real runtime value in an `instanceof`
 * check, so the real `@jupyterlab/notebook` ESM package would be pulled
 * into Jest's CommonJS test config. See `tests/unit/stale.spec.ts`; the
 * check is never reached from `readFocus`, so a trivial mock suffices.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { focusCell, readFocus } from '../../src/jupyter/focus';
import type { IJupyterEnv } from '../../src/jupyter/workspace';
import { LIMITS } from '../../src/limits';

interface IFakeCellModel {
  id: string;
  type: string;
  sharedModel: {
    getSource: () => string;
    getMetadata: (key: string) => unknown;
  };
}

function makeCellModel(
  id: string,
  metadata: Record<string, unknown> = {}
): IFakeCellModel {
  return {
    id,
    type: 'code',
    sharedModel: {
      getSource: () => `source of ${id}`,
      getMetadata: key => metadata[key]
    }
  };
}

function makeEditor(source: string, selection?: { from: number; to: number }) {
  return {
    getCursorPosition: () => ({ line: 0, column: 2 }),
    getSelection: () => ({
      start: { line: 0, column: selection?.from ?? 0 },
      end: { line: 0, column: selection?.to ?? 0 }
    }),
    getOffsetAt: (pos: { line: number; column: number }) => pos.column,
    getPositionAt: (offset: number) => ({ line: 0, column: offset }),
    model: {
      sharedModel: { getSource: () => source }
    }
  };
}

function makePanel(options: {
  cells: IFakeCellModel[];
  activeIndex: number;
  selectedIndices?: number[];
  selection?: { from: number; to: number };
}): {
  panel: unknown;
  widgets: unknown[];
} {
  const widgets = options.cells.map(cell => ({
    model: cell,
    editor: makeEditor(cell.sharedModel.getSource(), options.selection)
  }));
  const selected = new Set(options.selectedIndices ?? [options.activeIndex]);
  const content = {
    widgets,
    activeCell: widgets[options.activeIndex] ?? null,
    activeCellIndex: options.activeIndex,
    isSelectedOrActive: (widget: (typeof widgets)[number]) =>
      selected.has(widgets.indexOf(widget))
  };
  return { panel: { content }, widgets };
}

function threeCells(): IFakeCellModel[] {
  return [
    makeCellModel('cell-write'),
    makeCellModel('cell-none', { jupyterlite_webmcp: { access: 'none' } }),
    makeCellModel('cell-read', { jupyterlite_webmcp: { access: 'read' } })
  ];
}

describe('readFocus access policy', () => {
  it('withholds id, index, type, cursor and selection for a "none" active cell', () => {
    const { panel } = makePanel({ cells: threeCells(), activeIndex: 1 });

    const focus = readFocus(
      panel as unknown as Parameters<typeof readFocus>[0]
    );

    expect(focus.activeCellId).toBeNull();
    expect(focus.activeCellIndex).toBeNull();
    expect(focus.activeCellType).toBeNull();
    expect(focus.cursor).toBeNull();
    expect(focus.textSelection).toBeNull();
    expect(focus.hiddenActiveCell).toBe(true);
    expect(focus.selectedCellIds).not.toContain('cell-none');
    expect(focus.hiddenSelectedCellCount).toBe(1);
  });

  it('filters "none" cells out of a multi-cell selection', () => {
    const { panel } = makePanel({
      cells: threeCells(),
      activeIndex: 0,
      selectedIndices: [0, 1, 2]
    });

    const focus = readFocus(
      panel as unknown as Parameters<typeof readFocus>[0]
    );

    expect(focus.selectedCellIds).toEqual(['cell-write', 'cell-read']);
    expect(focus.hiddenSelectedCellCount).toBe(1);
    expect(focus.hiddenActiveCell).toBe(false);
  });

  it('reports a "read" active cell fully, selection included', () => {
    const { panel } = makePanel({
      cells: threeCells(),
      activeIndex: 2,
      selection: { from: 0, to: 6 }
    });

    const focus = readFocus(
      panel as unknown as Parameters<typeof readFocus>[0]
    );

    expect(focus.activeCellId).toBe('cell-read');
    expect(focus.activeCellIndex).toBe(2);
    expect(focus.activeCellType).toBe('code');
    expect(focus.cursor).toEqual({ line: 0, column: 2 });
    expect(focus.textSelection?.text).toBe('source');
    expect(focus.hiddenActiveCell).toBe(false);
    expect(focus.hiddenSelectedCellCount).toBe(0);
    expect(focus.selectedCellIds).toEqual(['cell-read']);
  });

  it('is unchanged for default ("write") cells with no metadata at all', () => {
    const { panel } = makePanel({
      cells: [makeCellModel('plain')],
      activeIndex: 0
    });

    const focus = readFocus(
      panel as unknown as Parameters<typeof readFocus>[0]
    );

    expect(focus).toEqual({
      activeCellId: 'plain',
      activeCellIndex: 0,
      activeCellType: 'code',
      selectedCellIds: ['plain'],
      hiddenSelectedCellCount: 0,
      hiddenActiveCell: false,
      cursor: { line: 0, column: 2 },
      textSelection: null
    });
  });
});

describe('readFocus text selection bound', () => {
  it('bounds a multibyte selection by UTF-8 bytes, never splitting a pair', () => {
    // 2000 emoji = 4000 UTF-16 units (under the old character check) but
    // 8000 UTF-8 bytes.
    const source = '😀'.repeat(2000);
    const cell = makeCellModel('emoji');
    cell.sharedModel.getSource = () => source;
    const { panel } = makePanel({
      cells: [cell],
      activeIndex: 0,
      selection: { from: 0, to: source.length }
    });

    const focus = readFocus(
      panel as unknown as Parameters<typeof readFocus>[0]
    );

    const text = focus.textSelection?.text ?? '';
    const bytes = Buffer.byteLength(text, 'utf8');
    expect(bytes).toBeLessThanOrEqual(LIMITS.MAX_SELECTED_TEXT_BYTES);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toBe('😀'.repeat(text.length / 2));
    expect(focus.textSelection?.truncated).toBe(true);
  });
});

describe('focusCell', () => {
  function makeEnv(cells: IFakeCellModel[]) {
    const { panel } = makePanel({ cells, activeIndex: 0 });
    const fullPanel = panel as Record<string, unknown>;
    fullPanel.id = 'panel-1';
    fullPanel.context = {
      ready: Promise.resolve(),
      path: 'nb.ipynb',
      model: {
        cells: { length: cells.length, get: (i: number) => cells[i] }
      }
    };
    const activateById = jest.fn();
    const env = {
      app: { shell: { activateById } },
      tracker: { currentWidget: fullPanel }
    } as unknown as IJupyterEnv;
    return { env, activateById };
  }

  // A bad id and a hidden cell must not bring the notebook forward.
  const badIds = [['missing'], ['cell-none']];

  it.each(badIds)('leaves the screen alone for id %s', async cellId => {
    const { env, activateById } = makeEnv(threeCells());
    const run = focusCell(env, { cellId });
    await expect(run).rejects.toMatchObject({ code: 'CELL_NOT_FOUND' });
    expect(activateById).not.toHaveBeenCalled();
  });
});

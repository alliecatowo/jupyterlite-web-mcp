/**
 * `NotebookCellWatcher` (`src/access/cellwatch.ts`) and the
 * `ProvenanceTracker` built on it, against fake notebooks that reproduce
 * JupyterLab 4's cell-list semantics (see `fake-notebooks.ts`).
 */
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));
jest.mock('../../src/access/guard', () => ({
  ...jest.requireActual('../../src/access/guard'),
  recordCellHistory: jest.fn()
}));

import { NotebookCellWatcher } from '../../src/access/cellwatch';
import {
  recordCellHistory,
  withAgentAttribution
} from '../../src/access/guard';
import { ProvenanceTracker } from '../../src/access/provenance';
import { FakeCell, FakePanel, FakeTracker, flush } from './fake-notebooks';

/** A watcher whose per-cell listener counts source edits per model. */
function countingWatcher(tracker: FakeTracker) {
  const edits = new Map<FakeCell, number>();
  const detached: FakeCell[] = [];
  const watcher = new NotebookCellWatcher(tracker as any, cell => {
    const fake = cell as unknown as FakeCell;
    const onChange = (): void => {
      edits.set(fake, (edits.get(fake) ?? 0) + 1);
    };
    fake.sharedModel.changed.connect(onChange);
    return () => {
      fake.sharedModel.changed.disconnect(onChange);
      detached.push(fake);
    };
  });
  return { watcher, edits, detached };
}

describe('NotebookCellWatcher', () => {
  it('attaches every cell of panels already open and of panels opened later', async () => {
    const tracker = new FakeTracker();
    tracker.panels.push(
      new FakePanel('a.ipynb', [new FakeCell('1'), new FakeCell('2')])
    );
    const { watcher } = countingWatcher(tracker);
    tracker.open(new FakePanel('b.ipynb', [new FakeCell('3')]));
    await flush();
    expect(watcher.attachedCount).toBe(3);
  });

  it('detaches everything when a panel closes, and a reopen with the same ids attaches fresh', async () => {
    const tracker = new FakeTracker();
    const { watcher, edits, detached } = countingWatcher(tracker);
    const oldCell = new FakeCell('same-id');
    const first = tracker.open(new FakePanel('nb.ipynb', [oldCell]));
    await flush();
    expect(watcher.attachedCount).toBe(1);

    first.dispose(); // no cells.changed 'remove', just like CellList.dispose()
    expect(detached).toEqual([oldCell]);
    expect(watcher.attachedCount).toBe(0);

    const newCell = new FakeCell('same-id');
    tracker.open(new FakePanel('nb.ipynb', [newCell]));
    await flush();
    expect(watcher.attachedCount).toBe(1);
    newCell.edit('x');
    oldCell.edit('y');
    expect(edits.get(newCell)).toBe(1);
    expect(edits.get(oldCell)).toBeUndefined();
  });

  it('keeps two notebooks that share cell ids independent', async () => {
    const tracker = new FakeTracker();
    const { watcher, edits } = countingWatcher(tracker);
    const a = new FakeCell('dup');
    const b = new FakeCell('dup');
    tracker.open(new FakePanel('a.ipynb', [a]));
    tracker.open(new FakePanel('b.ipynb', [b]));
    await flush();
    expect(watcher.attachedCount).toBe(2);
    b.edit('x');
    expect(edits.get(b)).toBe(1);
    expect(edits.get(a)).toBeUndefined();
  });

  it('detaches a removed cell even though remove events carry no cell', async () => {
    const tracker = new FakeTracker();
    const { watcher, detached } = countingWatcher(tracker);
    const keep = new FakeCell('keep');
    const gone = new FakeCell('gone');
    const panel = tracker.open(new FakePanel('nb.ipynb', [keep, gone]));
    await flush();
    panel.cells.remove(1);
    expect(detached).toEqual([gone]);
    expect(watcher.attachedCount).toBe(1);
  });

  it('re-attaches a moved cell (a new model with the same id)', async () => {
    const tracker = new FakeTracker();
    const { watcher, edits, detached } = countingWatcher(tracker);
    const original = new FakeCell('m');
    const panel = tracker.open(
      new FakePanel('nb.ipynb', [new FakeCell('x'), original])
    );
    await flush();
    const moved = panel.cells.move(1, 0);
    expect(detached).toEqual([original]);
    expect(watcher.attachedCount).toBe(2);
    moved.edit('new');
    expect(edits.get(moved)).toBe(1);
  });

  it('dispose detaches every cell', async () => {
    const tracker = new FakeTracker();
    const { watcher, detached } = countingWatcher(tracker);
    tracker.open(
      new FakePanel('nb.ipynb', [new FakeCell('1'), new FakeCell('2')])
    );
    await flush();
    watcher.dispose();
    expect(detached).toHaveLength(2);
    expect(watcher.attachedCount).toBe(0);
  });
});

describe('ProvenanceTracker', () => {
  beforeEach(() => {
    (recordCellHistory as jest.Mock).mockClear();
  });

  it('records human edits on a notebook that was closed and reopened with the same cell ids', async () => {
    const tracker = new FakeTracker();
    const provenance = new ProvenanceTracker(tracker as any);
    const first = tracker.open(new FakePanel('nb.ipynb', [new FakeCell('c1')]));
    await flush();
    first.dispose();

    const reopened = new FakeCell('c1');
    tracker.open(new FakePanel('nb.ipynb', [reopened]));
    await flush();

    jest.useFakeTimers();
    try {
      reopened.edit('typed by a human');
      jest.advanceTimersByTime(5000);
    } finally {
      jest.useRealTimers();
    }
    expect(recordCellHistory).toHaveBeenCalledTimes(1);
    expect((recordCellHistory as jest.Mock).mock.calls[0][0]).toBe(reopened);
    expect((recordCellHistory as jest.Mock).mock.calls[0][1]).toBe('human');
    provenance.dispose();
  });

  it('does not record agent-attributed edits, and drops a pending edit when the panel closes', async () => {
    const tracker = new FakeTracker();
    const provenance = new ProvenanceTracker(tracker as any);
    const cell = new FakeCell('c1');
    const panel = tracker.open(new FakePanel('nb.ipynb', [cell]));
    await flush();

    jest.useFakeTimers();
    try {
      withAgentAttribution(() => cell.edit('agent'));
      jest.advanceTimersByTime(5000);
      expect(recordCellHistory).not.toHaveBeenCalled();

      cell.edit('human');
      panel.dispose();
      jest.advanceTimersByTime(5000);
      expect(recordCellHistory).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
    provenance.dispose();
  });

  it('records a still-debouncing human edit before an agent edit, never after it', async () => {
    const tracker = new FakeTracker();
    const provenance = new ProvenanceTracker(tracker as any);
    const cell = new FakeCell('c1');
    tracker.open(new FakePanel('nb.ipynb', [cell]));
    await flush();

    jest.useFakeTimers();
    try {
      cell.edit('typed by a human');
      jest.advanceTimersByTime(1000);
      // The agent's write lands inside the debounce window: the human's
      // entry is recorded right then, ahead of the tool path's own
      // `'agent'` entry, not 2s later on top of it.
      withAgentAttribution(() => cell.edit('written by the agent'));
      expect(recordCellHistory).toHaveBeenCalledTimes(1);
      expect((recordCellHistory as jest.Mock).mock.calls[0][0]).toBe(cell);
      expect((recordCellHistory as jest.Mock).mock.calls[0][1]).toBe('human');

      jest.advanceTimersByTime(5000);
      expect(recordCellHistory).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
    provenance.dispose();
  });

  it('carries a still-debouncing human edit over to the new model when the cell is moved', async () => {
    const tracker = new FakeTracker();
    const provenance = new ProvenanceTracker(tracker as any);
    const original = new FakeCell('m');
    const panel = tracker.open(
      new FakePanel('nb.ipynb', [new FakeCell('x'), original])
    );
    await flush();

    jest.useFakeTimers();
    try {
      original.edit('typed by a human');
      jest.advanceTimersByTime(1000);
      const moved = panel.cells.move(1, 0);
      jest.advanceTimersByTime(5000);
      expect(recordCellHistory).toHaveBeenCalledTimes(1);
      expect((recordCellHistory as jest.Mock).mock.calls[0][0]).toBe(moved);
      expect((recordCellHistory as jest.Mock).mock.calls[0][1]).toBe('human');
    } finally {
      jest.useRealTimers();
    }
    provenance.dispose();
  });

  it('drops a still-debouncing human edit when the cell is deleted', async () => {
    const tracker = new FakeTracker();
    const provenance = new ProvenanceTracker(tracker as any);
    const cell = new FakeCell('gone');
    const panel = tracker.open(
      new FakePanel('nb.ipynb', [new FakeCell('keep'), cell])
    );
    await flush();

    jest.useFakeTimers();
    try {
      cell.edit('typed by a human');
      panel.cells.remove(1);
      jest.advanceTimersByTime(5000);
      expect(recordCellHistory).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
    provenance.dispose();
  });
});

/**
 * Minimal fake notebook tracker / panels / cell lists for testing the
 * per-cell and per-panel watchers without a JupyterLab runtime. Mirrors the
 * JupyterLab 4 behaviours those watchers depend on: a `'remove'` change
 * carries `undefined` placeholders, a move is a remove plus an add of a new
 * model with the same id, and closing a panel emits `disposed` with no
 * cell-list change.
 */
import { Signal } from '@lumino/signaling';

export class FakeCell {
  constructor(
    readonly id: string,
    source = ''
  ) {
    this._source = source;
  }
  isDisposed = false;
  readonly sharedModel = {
    changed: new Signal<unknown, { sourceChange?: unknown }>(this),
    getSource: (): string => this._source
  };
  /** Simulates a source edit, emitting a shared-model change. */
  edit(source: string): void {
    this._source = source;
    this.sharedModel.changed.emit({ sourceChange: [{ insert: source }] });
  }
  private _source: string;
}

export class FakeCellList {
  constructor(cells: FakeCell[]) {
    this._cells = cells;
  }
  readonly changed = new Signal<
    FakeCellList,
    { type: string; newValues: unknown[]; oldValues: unknown[] }
  >(this);
  get length(): number {
    return this._cells.length;
  }
  get(index: number): FakeCell {
    return this._cells[index];
  }
  ids(): string[] {
    return this._cells.map(c => c.id);
  }
  add(cell: FakeCell, index = this._cells.length): void {
    this._cells.splice(index, 0, cell);
    this.changed.emit({ type: 'add', newValues: [cell], oldValues: [] });
  }
  /** Like JupyterLab 4, a removed cell's model is disposed before `changed` fires. */
  remove(index: number): void {
    const [old] = this._cells.splice(index, 1);
    old.isDisposed = true;
    this.changed.emit({
      type: 'remove',
      newValues: [],
      oldValues: [undefined]
    });
  }
  /** JupyterLab 4 move: delete plus insert of a fresh model with the same id. */
  move(from: number, to: number): FakeCell {
    const [old] = this._cells.splice(from, 1);
    old.isDisposed = true;
    const clone = new FakeCell(old.id, old.sharedModel.getSource());
    this._cells.splice(to, 0, clone);
    this.changed.emit({
      type: 'remove',
      newValues: [],
      oldValues: [undefined]
    });
    this.changed.emit({ type: 'add', newValues: [clone], oldValues: [] });
    return clone;
  }
  private _cells: FakeCell[];
}

export class FakePanel {
  constructor(path: string, cells: FakeCell[]) {
    this.context = {
      path,
      ready: Promise.resolve(),
      pathChanged: new Signal<unknown, string>(this),
      model: { cells: new FakeCellList(cells) }
    };
  }
  isDisposed = false;
  readonly disposed = new Signal<FakePanel, void>(this);
  readonly context: {
    path: string;
    ready: Promise<void>;
    pathChanged: Signal<unknown, string>;
    model: { cells: FakeCellList };
  };
  get cells(): FakeCellList {
    return this.context.model.cells;
  }
  rename(path: string): void {
    this.context.path = path;
    this.context.pathChanged.emit(path);
  }
  dispose(): void {
    this.isDisposed = true;
    this.disposed.emit(undefined);
  }
}

export class FakeTracker {
  readonly widgetAdded = new Signal<FakeTracker, FakePanel>(this);
  readonly panels: FakePanel[] = [];
  forEach(fn: (panel: FakePanel) => void): void {
    this.panels.filter(p => !p.isDisposed).forEach(fn);
  }
  open(panel: FakePanel): FakePanel {
    this.panels.push(panel);
    this.widgetAdded.emit(panel);
    return panel;
  }
}

/** Lets `context.ready.then(...)` callbacks run. */
export function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

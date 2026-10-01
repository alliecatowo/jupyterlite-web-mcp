/**
 * `ProposalMarkers` (`src/propose/markers.ts`), the only Accept/Deny UI for
 * a pending proposal, against the fake notebooks of `fake-notebooks.ts` plus
 * a tiny fake DOM (the unit tests run without jsdom). Each fake view keeps
 * one widget per cell model the way JupyterLab's `Notebook` does: a moved
 * cell is a new model, so it gets a new widget and node, and the old widget
 * is disposed with whatever was inside its node.
 */
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { Signal } from '@lumino/signaling';

import { placeBanner, ProposalMarkers } from '../../src/propose/markers';
import { ProposeStore } from '../../src/propose/store';
import { FakeCell, FakePanel, FakeTracker, flush } from './fake-notebooks';

class FakeElement {
  constructor(readonly tagName: string) {}
  className = '';
  textContent = '';
  value = '';
  type = '';
  placeholder = '';
  maxLength = -1;
  onclick: (() => void) | null = null;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  setAttribute(): void {
    // Attributes are not inspected by these tests.
  }
  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    const parent = this.parentElement;
    if (parent) {
      parent.children.splice(parent.children.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  insertAdjacentElement(position: string, el: FakeElement): FakeElement {
    if (position !== 'afterend' || !this.parentElement) {
      throw new Error(`unsupported insertAdjacentElement(${position})`);
    }
    el.remove();
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, el);
    el.parentElement = this.parentElement;
    return el;
  }
  get nextElementSibling(): FakeElement | null {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  contains(node: FakeElement | null): boolean {
    for (let n = node; n; n = n.parentElement) {
      if (n === this) {
        return true;
      }
    }
    return false;
  }
  /** Supports `.cls` (any descendant) and `:scope > .cls` (direct child). */
  querySelector(selector: string): FakeElement | null {
    const direct = selector.startsWith(':scope > ');
    const cls = selector.replace(':scope > ', '').replace(/^\./, '');
    for (const child of this.children) {
      if (child.className.split(' ').includes(cls)) {
        return child;
      }
      const deeper = direct ? null : child.querySelector(selector);
      if (deeper) {
        return deeper;
      }
    }
    return null;
  }
  click(): void {
    this.onclick?.();
  }
}

class FakeWidget {
  constructor(readonly model: FakeCell) {
    const input = new FakeElement('div');
    input.className = 'jp-Cell-inputWrapper';
    this.node.appendChild(input);
  }
  readonly node = new FakeElement('div');
  isDisposed = false;
}

/** A panel whose `content.widgets` follows its cell list, like `Notebook`. */
class FakeView extends FakePanel {
  constructor(path: string, cells: FakeCell[]) {
    super(path, cells);
    this.content = { widgets: cells.map(c => new FakeWidget(c)) };
    // Connected before ProposalMarkers is created, so (as in JupyterLab,
    // where the notebook widget connects first) widgets are already synced
    // when the markers react to the same change.
    this.cells.changed.connect(() => this._sync());
  }
  content: { widgets: FakeWidget[] };
  widgetFor(id: string): FakeWidget {
    return this.content.widgets.find(w => w.model.id === id)!;
  }
  private _sync(): void {
    const next: FakeWidget[] = [];
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells.get(i);
      next.push(
        this.content.widgets.find(w => w.model === cell) ?? new FakeWidget(cell)
      );
    }
    for (const widget of this.content.widgets) {
      if (!next.includes(widget)) {
        widget.isDisposed = true;
      }
    }
    this.content.widgets = next;
  }
}

class FakeNotebookTracker extends FakeTracker {
  readonly currentChanged = new Signal<FakeNotebookTracker, unknown>(this);
  currentWidget: FakeView | null = null;
  show(view: FakeView): FakeView {
    this.open(view);
    this.currentWidget = view;
    this.currentChanged.emit(view);
    return view;
  }
}

function params() {
  return {
    before: 'a = 1',
    after: 'a = 2',
    expectedSourceHash: 'h',
    tool: 'jupyter_update_cell'
  };
}

function bannerIn(widget: FakeWidget): FakeElement | null {
  return widget.node.querySelector(':scope > .jp-webmcp-proposal');
}

function button(banner: FakeElement, cls: string): FakeElement {
  return banner.querySelector(`.${cls}`)!;
}

describe('ProposalMarkers', () => {
  let saved: unknown;
  beforeAll(() => {
    saved = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => new FakeElement(tag)
    };
  });
  afterAll(() => {
    (globalThis as any).document = saved;
  });

  async function setup() {
    const tracker = new FakeNotebookTracker();
    const store = new ProposeStore();
    const view = tracker.show(
      new FakeView('nb.ipynb', [new FakeCell('c1'), new FakeCell('c2')])
    );
    const markers = new ProposalMarkers(tracker as any, store);
    await flush();
    return { tracker, store, view, markers };
  }

  it('shows the banner under the input of the target cell', async () => {
    const { store, view, markers } = await setup();
    store.propose({ notebookPath: 'nb.ipynb', cellId: 'c2' }, params());
    const widget = view.widgetFor('c2');
    const banner = bannerIn(widget);
    expect(banner).not.toBeNull();
    expect(widget.node.children[1]).toBe(banner);
    expect(bannerIn(view.widgetFor('c1'))).toBeNull();
    markers.dispose();
  });

  it('keeps a moved cell reviewable: the banner follows it to its new widget and still decides', async () => {
    const { store, view, markers } = await setup();
    const { proposal, decision } = store.propose(
      { notebookPath: 'nb.ipynb', cellId: 'c2' },
      params()
    );
    const oldWidget = view.widgetFor('c2');
    expect(bannerIn(oldWidget)).not.toBeNull();

    view.cells.move(1, 0);
    const newWidget = view.widgetFor('c2');
    expect(newWidget).not.toBe(oldWidget);
    expect(oldWidget.isDisposed).toBe(true);
    expect(proposal.status).toBe('pending');

    const banner = bannerIn(newWidget);
    expect(banner).not.toBeNull();
    expect(bannerIn(oldWidget)).toBeNull();

    button(banner!, 'jp-webmcp-proposal-accept').click();
    await expect(decision).resolves.toEqual({ status: 'accepted' });
    expect(bannerIn(newWidget)).toBeNull();
    markers.dispose();
  });

  it('keeps a half-typed deny reason across unrelated store changes and across a move', async () => {
    const { store, view, markers } = await setup();
    const { decision } = store.propose(
      { notebookPath: 'nb.ipynb', cellId: 'c2' },
      params()
    );
    const banner = bannerIn(view.widgetFor('c2'))!;
    const input = banner.querySelector('.jp-webmcp-proposal-reason')!;
    input.value = 'Not until the';

    // Another proposal and a mode toggle both emit `store.changed`.
    store.propose({ notebookPath: 'nb.ipynb', cellId: 'c1' }, params());
    store.toggleMode();
    expect(banner.querySelector('.jp-webmcp-proposal-reason')).toBe(input);
    expect(input.value).toBe('Not until the');

    view.cells.move(1, 0);
    const moved = bannerIn(view.widgetFor('c2'))!;
    expect(moved.querySelector('.jp-webmcp-proposal-reason')!.value).toBe(
      'Not until the'
    );

    input.value = 'Not until the tests pass.';
    button(moved, 'jp-webmcp-proposal-deny').click();
    await expect(decision).resolves.toEqual({
      status: 'denied',
      reason: 'Not until the tests pass.'
    });
    markers.dispose();
  });

  it('removes every banner on dispose', async () => {
    const { store, view, markers } = await setup();
    store.propose({ notebookPath: 'nb.ipynb', cellId: 'c1' }, params());
    markers.dispose();
    expect(bannerIn(view.widgetFor('c1'))).toBeNull();
  });
});

describe('placeBanner', () => {
  function cellNode(withInput: boolean): FakeElement {
    const node = new FakeElement('div');
    if (withInput) {
      const input = new FakeElement('div');
      input.className = 'jp-Cell-inputWrapper';
      node.appendChild(input);
      node.appendChild(new FakeElement('div')); // outputs
    }
    return node;
  }

  it('re-inserts a banner that is no longer inside the cell node', () => {
    const banner = new FakeElement('div');
    const before = cellNode(true);
    placeBanner(before as any, banner as any);
    expect(before.children[1]).toBe(banner);

    const after = cellNode(true);
    placeBanner(after as any, banner as any);
    expect(after.contains(banner)).toBe(true);
    expect(before.contains(banner)).toBe(false);
  });

  it('moves a banner appended to a placeholder cell to after the input once it exists', () => {
    const node = cellNode(false);
    const banner = new FakeElement('div');
    placeBanner(node as any, banner as any);
    expect(node.children).toEqual([banner]);

    const input = new FakeElement('div');
    input.className = 'jp-Cell-inputWrapper';
    node.appendChild(input);
    placeBanner(node as any, banner as any);
    expect(node.children).toEqual([input, banner]);
  });

  it('leaves a banner that is already in place untouched', () => {
    const node = cellNode(true);
    const banner = new FakeElement('div');
    placeBanner(node as any, banner as any);
    const spy = jest.spyOn(banner, 'remove');
    placeBanner(node as any, banner as any);
    expect(spy).not.toHaveBeenCalled();
  });
});

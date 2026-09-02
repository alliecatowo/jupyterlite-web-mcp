import {
  resolveOutputSelection,
  textOffsetWithin
} from '../../src/selection/capture';

// Minimal, hand-built stand-ins for DOM nodes/elements: these only need to
// satisfy the handful of methods `src/selection/capture.ts` actually calls
// (nodeType, textContent, childNodes, closest, contains, querySelectorAll),
// not a real DOM. Kept local to this file.

function textNode(text: string): Node {
  return { nodeType: 3, textContent: text } as unknown as Node;
}

interface IFakeElement {
  nodeType: 1;
  childNodes: Node[];
  closest: (selector: string) => IFakeElement | null;
  contains: (node: unknown) => boolean;
  querySelectorAll: (selector: string) => IFakeElement[];
}

function makeElement(opts: {
  children?: Node[];
  matches?: string[];
  richDescendants?: IFakeElement[];
}): IFakeElement {
  const children = opts.children ?? [];
  const matches = opts.matches ?? [];
  const rich = opts.richDescendants ?? [];
  const el: IFakeElement = {
    nodeType: 1,
    childNodes: children,
    closest: selector => (matches.indexOf(selector) !== -1 ? el : null),
    contains: node => {
      if (node === el) {
        return true;
      }
      const stack: Node[] = [...children];
      while (stack.length) {
        const n = stack.shift()!;
        if (n === node) {
          return true;
        }
        const kids = (n as unknown as { childNodes?: Node[] }).childNodes;
        if (kids) {
          stack.push(...kids);
        }
      }
      return false;
    },
    querySelectorAll: selector =>
      selector.indexOf('canvas') !== -1 ? rich : []
  };
  return el;
}

function makeRange(opts: {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
  commonAncestorContainer: Node;
}): Range {
  return opts as unknown as Range;
}

function makeSelection(opts: {
  text: string;
  range: Range;
  collapsed?: boolean;
}): Selection {
  return {
    isCollapsed: opts.collapsed ?? false,
    rangeCount: 1,
    getRangeAt: () => opts.range,
    toString: () => opts.text
  } as unknown as Selection;
}

function makePanel(widgets: unknown[]): unknown {
  return { isDisposed: false, content: { widgets } };
}

function makeCellWidget(opts: {
  id: string;
  wrappers: IFakeElement[];
  containerMatches: IFakeElement;
}): unknown {
  const node = {
    contains: (n: unknown) =>
      n === opts.containerMatches ||
      opts.wrappers.indexOf(n as IFakeElement) !== -1,
    querySelectorAll: (selector: string) =>
      selector === '.jp-OutputArea-child' ? opts.wrappers : []
  };
  return {
    isDisposed: false,
    node,
    model: {
      id: opts.id,
      outputs: {
        length: opts.wrappers.length,
        get: (index: number) => ({
          toJSON: () => ({
            output_type: 'stream',
            name: 'stdout',
            text: `output ${index}`
          })
        })
      }
    }
  };
}

describe('textOffsetWithin', () => {
  it('finds the offset of a text node nested inside elements', () => {
    const t1 = textNode('hello ');
    const t2 = textNode('world');
    const root = makeElement({ children: [t1, t2] });
    expect(textOffsetWithin(root as unknown as Node, t2, 2)).toBe(8);
  });

  it('returns null when the target is not found in the subtree', () => {
    const root = makeElement({ children: [textNode('abc')] });
    const stray = textNode('xyz');
    expect(textOffsetWithin(root as unknown as Node, stray, 0)).toBeNull();
  });
});

describe('resolveOutputSelection', () => {
  it('returns null for a collapsed or empty selection', () => {
    const wrapper = makeElement({ matches: ['.jp-OutputArea-child'] });
    const range = makeRange({
      startContainer: wrapper as unknown as Node,
      startOffset: 0,
      endContainer: wrapper as unknown as Node,
      endOffset: 0,
      commonAncestorContainer: wrapper as unknown as Node
    });
    const selection = makeSelection({ text: '', range, collapsed: true });
    expect(
      resolveOutputSelection(selection, makePanel([]) as never)
    ).toBeNull();
  });

  it('returns null when the selection crosses two different output wrappers', () => {
    const wrapperA = makeElement({ matches: ['.jp-OutputArea-child'] });
    const wrapperB = makeElement({ matches: ['.jp-OutputArea-child'] });
    const range = makeRange({
      startContainer: wrapperA as unknown as Node,
      startOffset: 0,
      endContainer: wrapperB as unknown as Node,
      endOffset: 1,
      commonAncestorContainer: wrapperA as unknown as Node
    });
    const selection = makeSelection({ text: 'some text', range });
    expect(
      resolveOutputSelection(selection, makePanel([]) as never)
    ).toBeNull();
  });

  it('returns null when the selection touches a rich (non-text) node', () => {
    const canvas = makeElement({});
    (canvas as unknown as { contains: (n: unknown) => boolean }).contains = n =>
      n === commonAncestor;
    const commonAncestor = textNode('img text');
    const wrapper = makeElement({
      matches: ['.jp-OutputArea-child'],
      richDescendants: [canvas]
    });
    const range = makeRange({
      startContainer: wrapper as unknown as Node,
      startOffset: 0,
      endContainer: wrapper as unknown as Node,
      endOffset: 1,
      commonAncestorContainer: commonAncestor
    });
    const selection = makeSelection({ text: 'some text', range });
    expect(
      resolveOutputSelection(selection, makePanel([]) as never)
    ).toBeNull();
  });

  it('returns null when the selection text exceeds the bound', () => {
    const wrapper = makeElement({ matches: ['.jp-OutputArea-child'] });
    const range = makeRange({
      startContainer: wrapper as unknown as Node,
      startOffset: 0,
      endContainer: wrapper as unknown as Node,
      endOffset: 1,
      commonAncestorContainer: wrapper as unknown as Node
    });
    const huge = 'x'.repeat(5000);
    const selection = makeSelection({ text: huge, range });
    expect(
      resolveOutputSelection(selection, makePanel([]) as never)
    ).toBeNull();
  });

  it('captures a valid selection wholly inside one output wrapper', () => {
    const t1 = textNode('hello world');
    const wrapper = makeElement({
      matches: ['.jp-OutputArea-child'],
      children: [t1]
    });
    (t1 as unknown as { parentElement: unknown }).parentElement = wrapper;
    const range = makeRange({
      startContainer: t1,
      startOffset: 0,
      endContainer: t1,
      endOffset: 5,
      commonAncestorContainer: t1
    });
    const selection = makeSelection({ text: 'hello', range });
    const cellWidget = makeCellWidget({
      id: 'cell-1',
      wrappers: [wrapper],
      containerMatches: wrapper
    });
    const panel = makePanel([cellWidget]);

    const result = resolveOutputSelection(selection, panel as never);
    expect(result).not.toBeNull();
    expect(result!.cellId).toBe('cell-1');
    expect(result!.outputIndex).toBe(0);
    expect(result!.text).toBe('hello');
    expect(result!.range).toEqual({ start: 0, end: 5 });
    expect(typeof result!.outputFingerprint).toBe('string');
    expect(result!.outputFingerprint.length).toBeGreaterThan(0);
    expect(typeof result!.capturedAt).toBe('string');
  });

  it('returns null when no cell owns the matched wrapper', () => {
    const t1 = textNode('hello world');
    const wrapper = makeElement({
      matches: ['.jp-OutputArea-child'],
      children: [t1]
    });
    (t1 as unknown as { parentElement: unknown }).parentElement = wrapper;
    const range = makeRange({
      startContainer: t1,
      startOffset: 0,
      endContainer: t1,
      endOffset: 5,
      commonAncestorContainer: t1
    });
    const selection = makeSelection({ text: 'hello', range });
    const panel = makePanel([]);
    expect(resolveOutputSelection(selection, panel as never)).toBeNull();
  });

  it('never throws given a malformed panel/selection', () => {
    expect(() => resolveOutputSelection(null, null)).not.toThrow();
    expect(resolveOutputSelection(null, null)).toBeNull();
  });
});

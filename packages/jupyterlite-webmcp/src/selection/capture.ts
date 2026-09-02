/**
 * Captures a bounded, precisely-scoped record of the human's text selection
 * inside one notebook output — the "output-selection handoff" design in
 * `docs/agent-collaboration-roadmap.md`.
 *
 * WebMCP cannot wake an agent, and this module never pretends otherwise: it
 * only ever prepares context for an explicit human handoff (see
 * `src/ui/askAbout.ts`). Selecting output text on its own never contacts,
 * notifies, or summons anything.
 *
 * Capture rules (exactly as the roadmap specifies): a selection is recorded
 * only when it is non-empty and lies *wholly inside one output wrapper*
 * (`.jp-OutputArea-child`). It is `null` when the selection crosses cells or
 * outputs, includes notebook chrome, sits inside a rich, non-text widget
 * (an image, canvas, SVG, iframe, or similar), or exceeds the bounded text
 * size.
 */
import { Cell, ICodeCellModel } from '@jupyterlab/cells';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';

import { fingerprintOutput } from '../jupyter/outputs';
import { LIMITS } from '../limits';

/** DOM selector for one rendered output's wrapper element. */
const OUTPUT_WRAPPER_SELECTOR = '.jp-OutputArea-child';

/**
 * DOM elements matching this selector cannot be safely represented as plain
 * text: a selection touching one of them is rejected rather than silently
 * degraded to a meaningless string.
 */
const RICH_OUTPUT_SELECTOR = 'canvas, svg, img, iframe, video, audio, object, embed';

/**
 * A captured, bounded selection inside one notebook output. Mirrors the
 * roadmap's `IOutputSelection` exactly.
 */
export interface IOutputSelection {
  /** Id of the cell whose output was selected. */
  cellId: string;
  /** Index of the output within that cell. */
  outputIndex: number;
  /** The selected plain text, bounded to {@link LIMITS.MAX_SELECTED_TEXT_BYTES}. */
  text: string;
  /** Best-effort character offsets of the selection within the output's text, when computable. */
  range?: { start: number; end: number };
  /** Fingerprint of the raw output at capture time, so a later reader can detect replacement. */
  outputFingerprint: string;
  /** ISO timestamp of when this selection was captured. */
  capturedAt: string;
}

function isElement(node: Node | null): node is Element {
  return !!node && node.nodeType === 1;
}

function elementOf(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  return isElement(node) ? node : node.parentElement;
}

/** Walks up from `node` to the nearest `.jp-OutputArea-child` ancestor, or `null`. */
function closestOutputWrapper(node: Node | null): Element | null {
  const el = elementOf(node);
  if (!el || typeof el.closest !== 'function') {
    return null;
  }
  try {
    return el.closest(OUTPUT_WRAPPER_SELECTOR);
  } catch {
    return null;
  }
}

/**
 * Whether any rich, non-text-representable node inside `wrapper` overlaps
 * the selection's common ancestor — i.e. the selection is (at least partly)
 * inside a widget that cannot be safely turned into plain text.
 */
function touchesRichNode(wrapper: Element, range: Range): boolean {
  try {
    if (typeof wrapper.querySelectorAll !== 'function') {
      return false;
    }
    const richNodes = wrapper.querySelectorAll(RICH_OUTPUT_SELECTOR);
    for (let i = 0; i < richNodes.length; i++) {
      const rich = richNodes[i];
      if (typeof rich.contains === 'function' && rich.contains(range.commonAncestorContainer)) {
        return true;
      }
    }
    return false;
  } catch {
    // Presentation-only detection: treat an inspection failure as "safe not
    // to guess," i.e. do not falsely reject.
    return false;
  }
}

interface IOwningCell {
  widget: Cell;
  cellId: string;
  outputIndex: number;
}

/** Finds which cell (and which of its outputs) owns `wrapper`, or `null`. */
function findOwningCell(panel: NotebookPanel, wrapper: Element): IOwningCell | null {
  const widgets = panel.content.widgets;
  for (let i = 0; i < widgets.length; i++) {
    const widget = widgets[i];
    if (!widget || widget.isDisposed) {
      continue;
    }
    let contains = false;
    try {
      contains = typeof widget.node.contains === 'function' && widget.node.contains(wrapper);
    } catch {
      contains = false;
    }
    if (!contains) {
      continue;
    }
    try {
      const outputNodes = widget.node.querySelectorAll(OUTPUT_WRAPPER_SELECTOR);
      for (let j = 0; j < outputNodes.length; j++) {
        if (outputNodes[j] === wrapper) {
          return { widget, cellId: widget.model.id, outputIndex: j };
        }
      }
    } catch {
      return null;
    }
    return null;
  }
  return null;
}

/** Reads the raw nbformat output object at `index` on a code cell, or `undefined`. */
function readRawOutput(widget: Cell, index: number): unknown {
  try {
    const model = widget.model as ICodeCellModel;
    const outputs = model && model.outputs;
    if (!outputs || typeof outputs.get !== 'function' || index < 0 || index >= outputs.length) {
      return undefined;
    }
    const item = outputs.get(index);
    if (!item || typeof item.toJSON !== 'function') {
      return undefined;
    }
    return item.toJSON();
  } catch {
    return undefined;
  }
}

/**
 * Walks `root`'s subtree (in document order) accumulating text length until
 * it reaches `target` at `targetOffset`, returning the corresponding
 * character offset relative to `root`'s full text content, or `null` if
 * `target` is never found. A plain recursive walk over `childNodes` rather
 * than `document.createTreeWalker`, so it works unchanged against a real
 * DOM subtree and against a hand-built fake one in a unit test.
 */
export function textOffsetWithin(root: Node, target: Node, targetOffset: number): number | null {
  let total = 0;
  let found = -1;

  const walk = (node: Node): void => {
    if (found !== -1) {
      return;
    }
    if (node === target) {
      found = total + targetOffset;
      return;
    }
    if (node.nodeType === 3) {
      total += (node.textContent || '').length;
      return;
    }
    const children = node.childNodes;
    if (!children) {
      return;
    }
    for (let i = 0; i < children.length && found === -1; i++) {
      walk(children[i]);
    }
  };

  try {
    walk(root);
  } catch {
    return null;
  }
  return found === -1 ? null : found;
}

function computeSelectionRange(wrapper: Element, range: Range): { start: number; end: number } | undefined {
  const start = textOffsetWithin(wrapper, range.startContainer, range.startOffset);
  const end = textOffsetWithin(wrapper, range.endContainer, range.endOffset);
  if (start === null || end === null) {
    return undefined;
  }
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return { start: lo, end: hi };
}

/**
 * Resolves the browser's current selection into an {@link IOutputSelection},
 * or `null` per the capture rules documented on this module. Exported for
 * direct testing; never throws.
 */
export function resolveOutputSelection(
  selection: Selection | null,
  panel: NotebookPanel | null
): IOutputSelection | null {
  try {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }
    if (!panel || panel.isDisposed) {
      return null;
    }
    const text = selection.toString();
    if (!text || !text.trim()) {
      return null;
    }
    if (text.length > LIMITS.MAX_SELECTED_TEXT_BYTES) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const startWrapper = closestOutputWrapper(range.startContainer);
    const endWrapper = closestOutputWrapper(range.endContainer);
    if (!startWrapper || !endWrapper || startWrapper !== endWrapper) {
      return null; // Crosses cells/outputs, or touches notebook chrome outside any output.
    }

    if (touchesRichNode(startWrapper, range)) {
      return null;
    }

    const owner = findOwningCell(panel, startWrapper);
    if (!owner) {
      return null;
    }

    const rawOutput = readRawOutput(owner.widget, owner.outputIndex);
    if (rawOutput === undefined) {
      return null;
    }

    const result: IOutputSelection = {
      cellId: owner.cellId,
      outputIndex: owner.outputIndex,
      text,
      outputFingerprint: fingerprintOutput(rawOutput),
      capturedAt: new Date().toISOString()
    };
    const offsetRange = computeSelectionRange(startWrapper, range);
    if (offsetRange) {
      result.range = offsetRange;
    }
    return result;
  } catch {
    return null;
  }
}

function sameSelection(a: IOutputSelection | null, b: IOutputSelection | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.cellId === b.cellId &&
    a.outputIndex === b.outputIndex &&
    a.text === b.text &&
    a.outputFingerprint === b.outputFingerprint
  );
}

/**
 * Tracks the human's current in-output text selection across the active
 * notebook. Presentation/context-preparation state only: nothing about
 * tool correctness depends on it, and it never calls, wakes, or notifies an
 * agent — it only makes a bounded selection record available for an
 * explicit human handoff (an "Ask about this output" action) or for a
 * connected agent to read via a dedicated tool.
 */
export class OutputSelectionTracker implements IDisposable {
  constructor(tracker: INotebookTracker) {
    this._tracker = tracker;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('selectionchange', this._onSelectionChange);
    }
  }

  /** Emitted whenever {@link current} changes (including becoming/leaving `null`). */
  get changed(): ISignal<OutputSelectionTracker, void> {
    return this._changed;
  }

  /** The current output selection, or `null` when there isn't one. */
  get current(): IOutputSelection | null {
    return this._current;
  }

  /** Whether {@link dispose} has been called. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /** Explicitly clears the current selection, e.g. once it has been handed off. */
  clear(): void {
    this._set(null);
  }

  /** Disconnects the selection listener. */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('selectionchange', this._onSelectionChange);
    }
    Signal.clearData(this);
  }

  private _onSelectionChange = (): void => {
    if (this._isDisposed) {
      return;
    }
    try {
      const selection = typeof window !== 'undefined' ? window.getSelection() : null;
      const panel = this._tracker.currentWidget as NotebookPanel | null;
      this._set(resolveOutputSelection(selection, panel));
    } catch {
      this._set(null);
    }
  };

  private _set(next: IOutputSelection | null): void {
    if (sameSelection(this._current, next)) {
      return;
    }
    this._current = next;
    this._changed.emit();
  }

  private _isDisposed = false;
  private _current: IOutputSelection | null = null;
  private _tracker: INotebookTracker;
  private _changed = new Signal<OutputSelectionTracker, void>(this);
}

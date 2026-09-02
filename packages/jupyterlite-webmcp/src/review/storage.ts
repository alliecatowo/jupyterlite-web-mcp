import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ISignal, Signal } from '@lumino/signaling';

import { findCellIndexById } from '../jupyter/cells';
import { toolError } from '../jupyter/errors';
import { fingerprintOutput } from '../jupyter/outputs';
import { LIMITS } from '../limits';
import { resolveSourceAnchor } from './anchors';
import {
  AnchorKind,
  createThread,
  emptyReview,
  findThread,
  IAnchor,
  IAuthor,
  IReviewData,
  ISourceRange,
  IThread,
  normalizeReview,
  REVIEW_METADATA_KEY,
  ThreadStatus,
  upsertThread,
  withMessage,
  withStatus
} from './model';

/**
 * Determines the mime type that best represents a single raw nbformat
 * output, for use as a review comment anchor's `anchor.mimeType`
 * (SPEC §42). For `execute_result`/`display_data`, prefers the richest key
 * present in the output's `data` bundle: `text/html`, then any `image/*`
 * key, then `text/plain`, then (if none of those are present) whatever key
 * happens to come first. A `stream` output is always `text/plain`; an
 * `error` output is always `application/vnd.jupyter.error`. Returns
 * `undefined` for a malformed or unrecognized output.
 */
function mimeTypeForOutput(output: unknown): string | undefined {
  const o = (output ?? {}) as Record<string, unknown>;
  const outputType = o.output_type;

  if (outputType === 'stream') {
    return 'text/plain';
  }
  if (outputType === 'error') {
    return 'application/vnd.jupyter.error';
  }
  if (outputType === 'execute_result' || outputType === 'display_data') {
    const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return undefined;
    }
    if ('text/html' in data) {
      return 'text/html';
    }
    const image = keys.find(k => k.startsWith('image/'));
    if (image) {
      return image;
    }
    if ('text/plain' in data) {
      return 'text/plain';
    }
    return keys[0];
  }
  return undefined;
}

/** Minimal shape of the shared notebook metadata API we rely on. */
interface ISharedMetadata {
  getMetadata(): Record<string, unknown>;
  setMetadata(key: string, value: unknown): void;
}

/** How a thread's anchor lines up with the notebook as it is now. */
export interface IAnchorStatus {
  /** The anchor kind. */
  kind: AnchorKind;
  /** Cell the thread is attached to. */
  cellId: string;
  /** Whether that cell still exists. */
  cellExists: boolean;
  /** Current index of that cell, or `null`. */
  cellIndex: number | null;
  /** `valid`, `exact`, `reanchored`, `orphaned` or `cell-missing`. */
  state: string;
  /** Current source range for source-range anchors. */
  range?: ISourceRange;
  /** Current anchored text for source-range anchors. */
  text?: string;
  /** Output index for output anchors. */
  outputIndex?: number;
  /** Whether the anchored output changed since the comment was written. */
  outputChanged?: boolean;
}

/** Filter accepted by {@link ReviewStore.listThreads}. */
export interface IThreadFilter {
  /** Restrict to open or resolved threads. */
  status?: ThreadStatus | 'all';
  /** Restrict to threads anchored to one cell. */
  cellId?: string | null;
}

/**
 * Reads and writes review threads stored in notebook metadata.
 *
 * Comments are an ordinary notebook feature: they live in the notebook file,
 * travel with it when it is downloaded, and need no server, database or
 * account. The agent participates through the same store the panel uses.
 */
export class ReviewStore {
  constructor(tracker: INotebookTracker) {
    this._tracker = tracker;
    tracker.currentChanged.connect(() => this._changed.emit(), this);
    tracker.activeCellChanged.connect(() => this._changed.emit(), this);
  }

  /** Emitted whenever the visible review state may have changed. */
  get changed(): ISignal<ReviewStore, void> {
    return this._changed;
  }

  /** The notebook the human is currently in, if any. */
  get currentPanel(): NotebookPanel | null {
    return this._tracker.currentWidget;
  }

  /** Read the review data stored in a notebook, defensively normalized. */
  read(panel: NotebookPanel): IReviewData {
    try {
      const shared = panel.context.model
        .sharedModel as unknown as ISharedMetadata;
      const metadata = shared.getMetadata() ?? {};
      return normalizeReview(metadata[REVIEW_METADATA_KEY]);
    } catch {
      return emptyReview();
    }
  }

  /** Persist review data into the live notebook model. */
  write(panel: NotebookPanel, data: IReviewData): void {
    const shared = panel.context.model
      .sharedModel as unknown as ISharedMetadata;
    shared.setMetadata(REVIEW_METADATA_KEY, JSON.parse(JSON.stringify(data)));
    this._changed.emit();
  }

  /** List threads, newest first, bounded. */
  listThreads(panel: NotebookPanel, filter: IThreadFilter = {}): IThread[] {
    const data = this.read(panel);
    let threads = data.threads.slice();
    if (filter.status && filter.status !== 'all') {
      threads = threads.filter(thread => thread.status === filter.status);
    }
    if (filter.cellId) {
      threads = threads.filter(
        thread => thread.anchor.cellId === filter.cellId
      );
    }
    threads.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return threads;
  }

  /** Look up one thread, or `undefined`. */
  getThread(panel: NotebookPanel, threadId: string): IThread | undefined {
    return findThread(this.read(panel), threadId);
  }

  /** Look up one thread or throw a structured `COMMENT_NOT_FOUND`. */
  requireThread(panel: NotebookPanel, threadId: string): IThread {
    const thread = this.getThread(panel, threadId);
    if (!thread) {
      throw toolError(
        'COMMENT_NOT_FOUND',
        `No review thread with id "${threadId}" in "${panel.context.path}".`,
        { threadId, notebookPath: panel.context.path }
      );
    }
    return thread;
  }

  /** Create a thread anchored to a cell, a source range or an output. */
  createThread(
    panel: NotebookPanel,
    anchor: IAnchor,
    body: string,
    author: IAuthor
  ): IThread {
    this._validateAnchor(panel, anchor);
    const thread = createThread(anchor, this._boundBody(body), author);
    this.write(panel, upsertThread(this.read(panel), thread));
    return thread;
  }

  /**
   * Builds an `'output'` anchor for one output of a cell: the single shared
   * helper used by both the human context-menu path
   * (`src/review/commands.ts`) and the agent tool path
   * (`src/webmcp/tools.ts`), so the two never disagree on how
   * `anchor.mimeType` (SPEC §42) or `anchor.outputFingerprint` are derived.
   * `outputIndex` is not validated here — validate the resulting anchor
   * (e.g. via {@link createThread} or {@link reanchor}) before trusting it.
   */
  buildOutputAnchor(panel: NotebookPanel, cellId: string, outputIndex: number): IAnchor {
    const anchor: IAnchor = { kind: 'output', cellId, outputIndex };
    const output = this._rawOutput(panel, cellId, outputIndex);
    if (output !== undefined) {
      anchor.outputFingerprint = fingerprintOutput(output);
      const mimeType = mimeTypeForOutput(output);
      if (mimeType) {
        anchor.mimeType = mimeType;
      }
    }
    return anchor;
  }

  /**
   * Manually re-anchor an orphaned (or cell-missing) thread to a new
   * location, chosen by the human or agent rather than guessed
   * automatically (SPEC §41: "Allow manual re-anchoring if reasonable.").
   * The new anchor is validated exactly like a freshly created thread's
   * anchor; the thread's `id`, `status` and message history are preserved.
   */
  reanchor(panel: NotebookPanel, threadId: string, anchor: IAnchor): IThread {
    this._validateAnchor(panel, anchor);
    const thread = this.requireThread(panel, threadId);
    const updated: IThread = {
      ...thread,
      anchor: { ...anchor },
      updatedAt: new Date().toISOString()
    };
    this.write(panel, upsertThread(this.read(panel), updated));
    return updated;
  }

  /** Append a message to an existing thread. */
  reply(
    panel: NotebookPanel,
    threadId: string,
    body: string,
    author: IAuthor
  ): IThread {
    const thread = this.requireThread(panel, threadId);
    const updated = withMessage(thread, this._boundBody(body), author);
    this.write(panel, upsertThread(this.read(panel), updated));
    return updated;
  }

  /** Resolve or reopen a thread, preserving its history. */
  setStatus(
    panel: NotebookPanel,
    threadId: string,
    status: ThreadStatus,
    resolutionMessage?: string | null,
    author?: IAuthor
  ): IThread {
    let thread = this.requireThread(panel, threadId);
    if (resolutionMessage && author) {
      thread = withMessage(thread, this._boundBody(resolutionMessage), author);
    }
    const updated = withStatus(thread, status);
    this.write(panel, upsertThread(this.read(panel), updated));
    return updated;
  }

  /** Open and total thread counts for a notebook. */
  counts(panel: NotebookPanel): { openThreads: number; totalThreads: number } {
    const data = this.read(panel);
    let open = 0;
    for (let i = 0; i < data.threads.length; i++) {
      if (data.threads[i].status === 'open') {
        open += 1;
      }
    }
    return { openThreads: open, totalThreads: data.threads.length };
  }

  /**
   * Work out where a thread points now.
   *
   * A source anchor whose text moved is re-anchored when it can be identified
   * unambiguously, and marked orphaned otherwise: it is never silently
   * attached to different code.
   */
  anchorStatus(panel: NotebookPanel, thread: IThread): IAnchorStatus {
    const model = panel.context.model;
    const anchor = thread.anchor;
    const cellIndex = findCellIndexById(model, anchor.cellId);
    if (cellIndex === -1) {
      return {
        kind: anchor.kind,
        cellId: anchor.cellId,
        cellExists: false,
        cellIndex: null,
        state: 'cell-missing'
      };
    }

    const status: IAnchorStatus = {
      kind: anchor.kind,
      cellId: anchor.cellId,
      cellExists: true,
      cellIndex,
      state: 'valid'
    };

    if (anchor.kind === 'source-range') {
      const source = model.cells.get(cellIndex).sharedModel.getSource();
      const resolved = resolveSourceAnchor(anchor, source);
      status.state = resolved.state;
      status.range = resolved.range;
      status.text = resolved.text;
      return status;
    }

    if (anchor.kind === 'output') {
      status.outputIndex = anchor.outputIndex;
      const json = model.cells.get(cellIndex).sharedModel.toJSON() as {
        outputs?: unknown[];
      };
      const outputs = json.outputs ?? [];
      const index = anchor.outputIndex ?? 0;
      if (index >= outputs.length) {
        status.outputChanged = true;
        return status;
      }
      const fingerprint = fingerprintOutput(outputs[index]);
      status.outputChanged =
        !!anchor.outputFingerprint && fingerprint !== anchor.outputFingerprint;
      return status;
    }

    return status;
  }

  private _validateAnchor(panel: NotebookPanel, anchor: IAnchor): void {
    if (!anchor || typeof anchor.cellId !== 'string' || !anchor.cellId) {
      throw toolError('INVALID_ARGUMENT', 'The anchor needs a cellId.');
    }
    const index = findCellIndexById(panel.context.model, anchor.cellId);
    if (index === -1) {
      throw toolError(
        'CELL_NOT_FOUND',
        `No cell with id "${anchor.cellId}" in "${panel.context.path}".`,
        { cellId: anchor.cellId }
      );
    }
    if (anchor.kind === 'source-range') {
      if (!anchor.selectedText) {
        throw toolError(
          'COMMENT_ANCHOR_STALE',
          'A source-range comment needs a selection that exists in the cell.'
        );
      }
      const source = panel.context.model.cells
        .get(index)
        .sharedModel.getSource();
      if (source.indexOf(anchor.selectedText) === -1) {
        throw toolError(
          'COMMENT_ANCHOR_STALE',
          'The selected text is not present in that cell any more.',
          { cellId: anchor.cellId }
        );
      }
    }
    if (anchor.kind === 'output') {
      const json = panel.context.model.cells.get(index).sharedModel.toJSON() as {
        outputs?: unknown[];
      };
      const outputs = json.outputs ?? [];
      const outputIndex = anchor.outputIndex ?? 0;
      if (outputIndex < 0 || outputIndex >= outputs.length) {
        throw toolError(
          'COMMENT_ANCHOR_STALE',
          `Cell "${anchor.cellId}" has no output at index ${outputIndex}. Run it first.`,
          { cellId: anchor.cellId, outputIndex }
        );
      }
    }
  }

  /** Raw nbformat output at `outputIndex` in cell `cellId`, or `undefined`. */
  private _rawOutput(panel: NotebookPanel, cellId: string, outputIndex: number): unknown {
    const index = findCellIndexById(panel.context.model, cellId);
    if (index === -1) {
      return undefined;
    }
    const json = panel.context.model.cells.get(index).sharedModel.toJSON() as {
      outputs?: unknown[];
    };
    const outputs = json.outputs ?? [];
    return outputs[outputIndex];
  }

  private _boundBody(body: string): string {
    if (typeof body !== 'string' || body.trim() === '') {
      throw toolError('INVALID_ARGUMENT', 'A comment message is required.');
    }
    return body.slice(0, LIMITS.MAX_COMMENT_BODY_BYTES);
  }

  private _tracker: INotebookTracker;
  private _changed = new Signal<ReviewStore, void>(this);
}

/**
 * Pure data model for review comment threads persisted in notebook
 * metadata. Notebook metadata is untrusted input (it may have been hand
 * edited, come from an old schema version, or be outright malformed), so
 * {@link normalizeReview} is deliberately defensive and never throws.
 */

/**
 * The notebook metadata key under which review data is stored.
 */
export const REVIEW_METADATA_KEY = 'jupyterlite_webmcp_review';

/**
 * The schema version written by this module. Bump when the on-disk shape of
 * {@link IReviewData} changes incompatibly.
 */
export const REVIEW_SCHEMA_VERSION = 1;

/**
 * Whether a review thread is still open or has been resolved.
 */
export type ThreadStatus = 'open' | 'resolved';

/**
 * What kind of notebook location a comment thread is anchored to.
 */
export type AnchorKind = 'cell' | 'source-range' | 'output';

/**
 * A zero-based line/column position within a cell's source text.
 */
export interface IPosition {
  line: number;
  column: number;
}

/**
 * A half-open range within a cell's source text, from `start` to `end`.
 */
export interface ISourceRange {
  start: IPosition;
  end: IPosition;
}

/**
 * Where a review thread is anchored: a whole cell, a range of a cell's
 * source text (with enough context to re-anchor after edits), or one of a
 * cell's outputs.
 */
export interface IAnchor {
  kind: AnchorKind;
  cellId: string;
  sourceRange?: ISourceRange;
  selectedText?: string;
  selectedTextHash?: string;
  prefix?: string;
  suffix?: string;
  outputIndex?: number;
  mimeType?: string;
  outputFingerprint?: string;
}

/**
 * Who authored a message: a human reviewer, or an agent acting on their
 * behalf.
 */
export interface IAuthor {
  kind: 'human' | 'agent';
  name: string | null;
}

/**
 * A single message within a review thread.
 */
export interface IMessage {
  id: string;
  author: IAuthor;
  createdAt: string;
  body: string;
}

/**
 * A review comment thread: an anchor into the notebook plus an ordered list
 * of messages and a status.
 */
export interface IThread {
  id: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  anchor: IAnchor;
  messages: IMessage[];
}

/**
 * The top-level review data persisted under {@link REVIEW_METADATA_KEY} in
 * notebook metadata.
 */
export interface IReviewData {
  version: number;
  threads: IThread[];
}

/**
 * The author value used for messages written by a human reviewer.
 */
export const HUMAN_AUTHOR: IAuthor = { kind: 'human', name: null };

/**
 * The author value used for messages written by the browser agent on the
 * human's behalf.
 */
export const AGENT_AUTHOR: IAuthor = { kind: 'agent', name: 'Browser agent' };

const MAX_BODY_CHARS = 8192;

/**
 * Generates a new unique id, using `crypto.randomUUID()` when available and
 * falling back to an RFC4122-v4-shaped id built from `Math.random()`
 * otherwise.
 */
export function newId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) {
      uuid += '-';
    }
    let digit: number;
    if (i === 12) {
      digit = 4;
    } else if (i === 16) {
      digit = 8 + Math.floor(Math.random() * 4);
    } else {
      digit = Math.floor(Math.random() * 16);
    }
    uuid += digit.toString(16);
  }
  return uuid;
}

/**
 * Returns a fresh, empty review data structure at the current schema
 * version.
 */
export function emptyReview(): IReviewData {
  return { version: REVIEW_SCHEMA_VERSION, threads: [] };
}

function clampString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > MAX_BODY_CHARS ? value.slice(0, MAX_BODY_CHARS) : value;
}

function normalizeAuthor(raw: unknown): IAuthor {
  const a = (raw ?? {}) as Record<string, unknown>;
  const kind: IAuthor['kind'] = a.kind === 'agent' ? 'agent' : 'human';
  const name = typeof a.name === 'string' ? clampString(a.name) : null;
  return { kind, name };
}

function normalizePosition(raw: unknown): IPosition | undefined {
  const p = raw as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') {
    return undefined;
  }
  const line = typeof p.line === 'number' ? p.line : undefined;
  const column = typeof p.column === 'number' ? p.column : undefined;
  if (line === undefined || column === undefined) {
    return undefined;
  }
  return { line, column };
}

function normalizeSourceRange(raw: unknown): ISourceRange | undefined {
  const r = raw as Record<string, unknown> | undefined;
  if (!r || typeof r !== 'object') {
    return undefined;
  }
  const start = normalizePosition(r.start);
  const end = normalizePosition(r.end);
  if (!start || !end) {
    return undefined;
  }
  return { start, end };
}

function normalizeAnchor(raw: unknown): IAnchor | undefined {
  const a = raw as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') {
    return undefined;
  }
  const cellId = typeof a.cellId === 'string' ? a.cellId : undefined;
  if (!cellId) {
    return undefined;
  }
  const kind: AnchorKind = a.kind === 'source-range' || a.kind === 'output' ? a.kind : 'cell';
  const anchor: IAnchor = { kind, cellId };

  const sourceRange = normalizeSourceRange(a.sourceRange);
  if (sourceRange) {
    anchor.sourceRange = sourceRange;
  }
  if (typeof a.selectedText === 'string') {
    anchor.selectedText = clampString(a.selectedText);
  }
  if (typeof a.selectedTextHash === 'string') {
    anchor.selectedTextHash = a.selectedTextHash;
  }
  if (typeof a.prefix === 'string') {
    anchor.prefix = clampString(a.prefix);
  }
  if (typeof a.suffix === 'string') {
    anchor.suffix = clampString(a.suffix);
  }
  if (typeof a.outputIndex === 'number') {
    anchor.outputIndex = a.outputIndex;
  }
  if (typeof a.mimeType === 'string') {
    anchor.mimeType = a.mimeType;
  }
  if (typeof a.outputFingerprint === 'string') {
    anchor.outputFingerprint = a.outputFingerprint;
  }
  return anchor;
}

function normalizeMessage(raw: unknown): IMessage | undefined {
  const m = raw as Record<string, unknown> | undefined;
  if (!m || typeof m !== 'object') {
    return undefined;
  }
  const id = typeof m.id === 'string' ? m.id : undefined;
  if (!id) {
    return undefined;
  }
  const createdAt = typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString();
  const body = clampString(m.body);
  const author = normalizeAuthor(m.author);
  return { id, author, createdAt, body };
}

function normalizeThread(raw: unknown): IThread | undefined {
  const t = raw as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object') {
    return undefined;
  }
  const id = typeof t.id === 'string' ? t.id : undefined;
  if (!id) {
    return undefined;
  }
  const anchor = normalizeAnchor(t.anchor);
  if (!anchor) {
    return undefined;
  }
  if (!Array.isArray(t.messages)) {
    return undefined;
  }
  const messages: IMessage[] = [];
  for (const rawMessage of t.messages) {
    const message = normalizeMessage(rawMessage);
    if (message) {
      messages.push(message);
    }
  }
  const status: ThreadStatus = t.status === 'resolved' ? 'resolved' : 'open';
  const now = new Date().toISOString();
  const createdAt = typeof t.createdAt === 'string' ? t.createdAt : now;
  const updatedAt = typeof t.updatedAt === 'string' ? t.updatedAt : createdAt;
  return { id, status, createdAt, updatedAt, anchor, messages };
}

/**
 * Defensively normalizes arbitrary, possibly-malformed input (as loaded from
 * untrusted notebook metadata) into a well-formed {@link IReviewData}.
 * Threads missing an `id`, a valid `anchor.cellId`, or a valid `messages`
 * array are dropped; every string field is clamped to a bounded length;
 * this function never throws, returning {@link emptyReview} for anything
 * that isn't at least a plausible review-data object.
 */
export function normalizeReview(raw: unknown): IReviewData {
  try {
    if (!raw || typeof raw !== 'object') {
      return emptyReview();
    }
    const data = raw as Record<string, unknown>;
    if (!Array.isArray(data.threads)) {
      return emptyReview();
    }
    const threads: IThread[] = [];
    for (const rawThread of data.threads) {
      const thread = normalizeThread(rawThread);
      if (thread) {
        threads.push(thread);
      }
    }
    return { version: REVIEW_SCHEMA_VERSION, threads };
  } catch {
    return emptyReview();
  }
}

/**
 * Creates a new, open thread anchored at `anchor`, with a single message
 * `body` written by `author`.
 */
export function createThread(anchor: IAnchor, body: string, author: IAuthor): IThread {
  const now = new Date().toISOString();
  const message: IMessage = {
    id: newId(),
    author: { ...author },
    createdAt: now,
    body: clampString(body)
  };
  return {
    id: newId(),
    status: 'open',
    createdAt: now,
    updatedAt: now,
    anchor: { ...anchor },
    messages: [message]
  };
}

/**
 * Returns a new thread with a message `body` (from `author`) appended.
 * Immutable: does not modify `thread`.
 */
export function withMessage(thread: IThread, body: string, author: IAuthor): IThread {
  const now = new Date().toISOString();
  const message: IMessage = {
    id: newId(),
    author: { ...author },
    createdAt: now,
    body: clampString(body)
  };
  return {
    ...thread,
    anchor: { ...thread.anchor },
    messages: [...thread.messages, message],
    updatedAt: now
  };
}

/**
 * Returns a new thread with its `status` changed. Immutable: does not
 * modify `thread`.
 */
export function withStatus(thread: IThread, status: ThreadStatus): IThread {
  return {
    ...thread,
    anchor: { ...thread.anchor },
    messages: thread.messages.map(m => ({ ...m })),
    status,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Returns a new {@link IReviewData} with `thread` inserted (if its `id` is
 * new) or replacing the existing thread with the same `id`. Immutable: does
 * not modify `data`.
 */
export function upsertThread(data: IReviewData, thread: IThread): IReviewData {
  const index = data.threads.findIndex(t => t.id === thread.id);
  const threads = data.threads.slice();
  if (index >= 0) {
    threads[index] = thread;
  } else {
    threads.push(thread);
  }
  return { ...data, threads };
}

/**
 * Finds a thread by id, or `undefined` if none matches.
 */
export function findThread(data: IReviewData, threadId: string): IThread | undefined {
  return data.threads.find(t => t.id === threadId);
}

/**
 * Counts the number of threads whose status is `'open'`.
 */
export function countOpen(data: IReviewData): number {
  return data.threads.filter(t => t.status === 'open').length;
}

/**
 * Returns all threads anchored to the given cell id, in their stored order.
 */
export function threadsForCell(data: IReviewData, cellId: string): IThread[] {
  return data.threads.filter(t => t.anchor.cellId === cellId);
}

/**
 * Turns a completed WebMCP tool invocation into an {@link IActivityEvent},
 * with no per-tool wiring required elsewhere. Kept pure and defensive: it
 * reads plain data in and returns plain data out, and must never throw, no
 * matter how malformed the payload it is handed turns out to be.
 */
import { ActivityKind, IActivityEvent } from './model';

/** The maximum number of cell ids kept on a single derived event. */
const MAX_CELL_IDS = 25;

/** The facts recorded once a tool invocation has settled, one way or another. */
export interface IInvocationFacts {
  /** The tool name, e.g. `'jupyter_get_cells'`. */
  tool: string;
  /** The raw input the tool was called with. */
  input: Record<string, unknown>;
  /** The handler's return value on success, or the structured error on failure. */
  payload: unknown;
  /** Whether the invocation succeeded. */
  ok: boolean;
  /** Structured error code, present only when `ok` is `false`. */
  errorCode?: string;
  /** How long the invocation took, in milliseconds. */
  durationMs: number;
}

const READ_TOOLS = new Set([
  'jupyter_get_context',
  'jupyter_get_cells',
  'jupyter_get_cell_access',
  'jupyter_get_output_selection',
  'jupyter_export_notebook',
  'jupyter_list_workspace',
  'jupyter_list_comments',
  'jupyter_get_comment'
]);

const WRITE_TOOLS = new Set([
  'jupyter_insert_cell',
  'jupyter_update_cell',
  'jupyter_delete_cell',
  'jupyter_save_notebook',
  'jupyter_create_notebook'
]);

const FOCUS_TOOLS = new Set(['jupyter_focus_cell', 'jupyter_focus_comment']);

const COMMENT_TOOLS = new Set([
  'jupyter_create_comment',
  'jupyter_reply_comment',
  'jupyter_resolve_comment',
  'jupyter_reopen_comment'
]);

/**
 * Classifies a tool name into a broad {@link ActivityKind}. Unknown tool
 * names fall back to `'read'` rather than throwing.
 */
export function activityKindFor(tool: string): ActivityKind {
  if (READ_TOOLS.has(tool)) {
    return 'read';
  }
  if (WRITE_TOOLS.has(tool)) {
    return 'write';
  }
  if (tool === 'jupyter_run_cells') {
    return 'run';
  }
  if (FOCUS_TOOLS.has(tool)) {
    return 'focus';
  }
  if (tool === 'jupyter_open_notebook') {
    return 'navigate';
  }
  if (tool === 'jupyter_kernel_action') {
    return 'kernel';
  }
  if (COMMENT_TOOLS.has(tool)) {
    return 'comment';
  }
  return 'read';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

/** Reads `obj[key]` defensively; returns `undefined` for anything not an object. */
function get(obj: unknown, key: string): unknown {
  return isObject(obj) ? obj[key] : undefined;
}

function pushId(ids: string[], seen: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value && !seen.has(value)) {
    seen.add(value);
    ids.push(value);
  }
}

/**
 * Collects every cell id touched by an invocation, from the payload and
 * (as a fallback) the input, in the priority order documented on
 * {@link deriveActivity}. Deduped, order-preserving, capped at 25.
 */
function collectCellIds(payload: unknown, input: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const cells = get(payload, 'cells');
  if (Array.isArray(cells)) {
    for (const entry of cells) {
      pushId(ids, seen, get(entry, 'id'));
    }
  }

  pushId(ids, seen, get(get(payload, 'cell'), 'id'));

  const results = get(payload, 'results');
  if (Array.isArray(results)) {
    for (const entry of results) {
      pushId(ids, seen, get(entry, 'cellId'));
    }
  }

  pushId(ids, seen, get(payload, 'deletedCellId'));
  pushId(ids, seen, get(payload, 'cellId'));
  pushId(ids, seen, get(get(payload, 'focus'), 'activeCellId'));
  pushId(ids, seen, get(get(get(payload, 'thread'), 'anchor'), 'cellId'));

  const inputCellIds = input.cellIds;
  if (Array.isArray(inputCellIds)) {
    for (const value of inputCellIds) {
      pushId(ids, seen, value);
    }
  }
  pushId(ids, seen, input.cellId);
  pushId(ids, seen, input.referenceCellId);
  pushId(ids, seen, get(input.anchor, 'cellId'));

  return ids.slice(0, MAX_CELL_IDS);
}

/** Reads the notebook path an invocation acted on, or `null`. */
function extractNotebookPath(payload: unknown, input: Record<string, unknown>): string | null {
  const fromNotebook = get(get(payload, 'notebook'), 'path');
  if (typeof fromNotebook === 'string') {
    return fromNotebook;
  }
  const direct = get(payload, 'notebookPath');
  if (typeof direct === 'string') {
    return direct;
  }
  const fromInput = input.notebookPath;
  if (typeof fromInput === 'string') {
    return fromInput;
  }
  return null;
}

/** Reads the output index an invocation is anchored to, when there is one. */
function extractOutputIndex(payload: unknown, input: Record<string, unknown>): number | undefined {
  const fromThread = get(get(get(payload, 'thread'), 'anchor'), 'outputIndex');
  if (typeof fromThread === 'number') {
    return fromThread;
  }
  const direct = get(payload, 'outputIndex');
  if (typeof direct === 'number') {
    return direct;
  }
  const fromInputAnchor = get(input.anchor, 'outputIndex');
  if (typeof fromInputAnchor === 'number') {
    return fromInputAnchor;
  }
  return undefined;
}

/** Finds a 1-based index to mention in a summary, when the payload has one. */
function firstCellIndex(payload: unknown): number | null {
  const cells = get(payload, 'cells');
  if (Array.isArray(cells) && cells.length > 0) {
    const index = get(cells[0], 'index');
    if (typeof index === 'number') {
      return index;
    }
  }
  const cellIndex = get(get(payload, 'cell'), 'index');
  if (typeof cellIndex === 'number') {
    return cellIndex;
  }
  const results = get(payload, 'results');
  if (Array.isArray(results) && results.length > 0) {
    const index = get(results[0], 'index');
    if (typeof index === 'number') {
      return index;
    }
  }
  const activeIndex = get(get(payload, 'focus'), 'activeCellIndex');
  if (typeof activeIndex === 'number') {
    return activeIndex;
  }
  const contextIndex = get(get(get(payload, 'context'), 'cell'), 'index');
  if (typeof contextIndex === 'number') {
    return contextIndex;
  }
  return null;
}

/** A short, present-tense reference to the cell a summary is about. */
function cellLabel(payload: unknown): string {
  const index = firstCellIndex(payload);
  return index === null ? 'a cell' : `cell ${index + 1}`;
}

function successSummary(tool: string, payload: unknown, input: Record<string, unknown>): string {
  switch (tool) {
    case 'jupyter_get_context':
      return 'checked the notebook state';
    case 'jupyter_list_workspace':
      return 'listed the workspace';
    case 'jupyter_open_notebook': {
      const name = get(get(payload, 'notebook'), 'name');
      return typeof name === 'string' ? `opened ${name}` : 'opened a notebook';
    }
    case 'jupyter_create_notebook': {
      const name = get(get(payload, 'notebook'), 'name');
      return typeof name === 'string' ? `created ${name}` : 'created a notebook';
    }
    case 'jupyter_get_cells': {
      const cells = get(payload, 'cells');
      const count = Array.isArray(cells) ? cells.length : 0;
      return count === 1 ? `read ${cellLabel(payload)}` : `read ${count} cells`;
    }
    case 'jupyter_get_cell_access':
      return 'checked cell access';
    case 'jupyter_get_output_selection':
      return `read the selected output from ${cellLabel(payload)}`;
    case 'jupyter_export_notebook':
      return 'exported the notebook as Markdown';
    case 'jupyter_insert_cell':
      return `inserted ${cellLabel(payload)}`;
    case 'jupyter_update_cell':
      return `edited ${cellLabel(payload)}`;
    case 'jupyter_delete_cell':
      return 'deleted a cell';
    case 'jupyter_run_cells': {
      const results = get(payload, 'results');
      const list = Array.isArray(results) ? results : [];
      const failed = list.find(entry => get(entry, 'status') === 'error');
      const ename = failed ? get(failed, 'ename') : undefined;
      const suffix = typeof ename === 'string' && ename ? ` — ${ename}` : '';
      if (list.length === 1) {
        const index = get(list[0], 'index');
        const label = typeof index === 'number' ? `cell ${index + 1}` : 'a cell';
        return `ran ${label}${suffix}`;
      }
      return `ran ${list.length} cells${suffix}`;
    }
    case 'jupyter_focus_cell': {
      const index = get(get(payload, 'focus'), 'activeCellIndex');
      return typeof index === 'number' ? `pointed at cell ${index + 1}` : 'pointed at a cell';
    }
    case 'jupyter_save_notebook':
      return 'saved the notebook';
    case 'jupyter_kernel_action': {
      const action = get(payload, 'action') ?? input.action;
      if (action === 'restart') {
        return 'restarted the kernel';
      }
      if (action === 'interrupt') {
        return 'interrupted the kernel';
      }
      return 'acted on the kernel';
    }
    case 'jupyter_list_comments': {
      const threads = get(payload, 'threads');
      const count = Array.isArray(threads) ? threads.length : 0;
      return count === 0 ? 'checked the comments' : `read ${count} comment${count === 1 ? '' : 's'}`;
    }
    case 'jupyter_get_comment':
      return `read a comment on ${cellLabel(payload)}`;
    case 'jupyter_create_comment':
      return `commented on ${cellLabel(payload)}`;
    case 'jupyter_reply_comment':
      return 'replied to a comment';
    case 'jupyter_resolve_comment':
      return 'resolved a comment';
    case 'jupyter_reopen_comment':
      return 'reopened a comment';
    case 'jupyter_focus_comment':
      return 'pointed at a comment';
    default:
      return 'did something in the notebook';
  }
}

/** Plain-language verb phrase for a failure summary, per tool. */
const FAILURE_VERB: Record<string, string> = {
  jupyter_get_context: 'read the notebook state',
  jupyter_list_workspace: 'list the workspace',
  jupyter_open_notebook: 'open that notebook',
  jupyter_create_notebook: 'create that notebook',
  jupyter_get_cells: 'read the cells',
  jupyter_get_cell_access: 'check cell access',
  jupyter_get_output_selection: 'read the selected output',
  jupyter_export_notebook: 'export the notebook as Markdown',
  jupyter_insert_cell: 'insert a cell',
  jupyter_update_cell: 'edit a cell',
  jupyter_delete_cell: 'delete a cell',
  jupyter_run_cells: 'run the cells',
  jupyter_focus_cell: 'point at that cell',
  jupyter_save_notebook: 'save the notebook',
  jupyter_kernel_action: 'act on the kernel',
  jupyter_list_comments: 'list the comments',
  jupyter_get_comment: 'read that comment',
  jupyter_create_comment: 'add that comment',
  jupyter_reply_comment: 'reply to that comment',
  jupyter_resolve_comment: 'resolve that comment',
  jupyter_reopen_comment: 'reopen that comment',
  jupyter_focus_comment: 'point at that comment'
};

/** Plain-language reason for a failure summary, per structured error code. */
const FAILURE_REASON: Record<string, string> = {
  STALE_CELL: 'the cell changed since it was read',
  CELL_NOT_FOUND: 'that cell no longer exists',
  NOTEBOOK_NOT_FOUND: 'that notebook could not be found',
  NO_ACTIVE_NOTEBOOK: 'no notebook is open',
  INVALID_PATH: 'that path is not valid',
  PATH_EXISTS: 'a file already exists there',
  INVALID_CELL_TYPE: 'that is not a supported cell type',
  INVALID_ARGUMENT: 'the request was not valid',
  KERNEL_UNAVAILABLE: 'no kernel is available',
  EXECUTION_ERROR: 'the cell raised an error',
  ABORTED: 'it was cancelled',
  WEBMCP_UNAVAILABLE: 'the browser does not support this',
  COMMENT_NOT_FOUND: 'that comment no longer exists',
  COMMENT_ANCHOR_STALE: 'that comment no longer matches the notebook',
  CELL_ACCESS_DENIED: 'the notebook owner restricted that cell',
  INTERNAL_ERROR: 'something went wrong'
};

function failureSummary(tool: string, errorCode: string | undefined): string {
  const verb = FAILURE_VERB[tool] ?? `use ${tool}`;
  const reason = (errorCode && FAILURE_REASON[errorCode]) || 'something went wrong';
  return `could not ${verb} — ${reason}`;
}

/**
 * Derives the presentation half of an {@link IActivityEvent} from the facts
 * of a completed tool invocation. Never throws: any field it cannot make
 * sense of is simply omitted, and a wholly malformed `facts` value (including
 * `undefined`, `null`, a number, or `{}`) still produces a generic, valid
 * event.
 *
 * Cell ids are read, in priority order, from: the payload's `cells[].id`,
 * `cell.id`, `results[].cellId`, `deletedCellId`, `focus.activeCellId`,
 * `thread.anchor.cellId`; then the input's `cellIds`, `cellId`,
 * `referenceCellId`, `anchor.cellId`. Every match across every source is
 * kept, deduped and order-preserved, capped at 25.
 */
export function deriveActivity(facts: IInvocationFacts): Omit<IActivityEvent, 'id' | 'at' | 'participantId'> {
  const source = (facts ?? {}) as Partial<IInvocationFacts>;
  const tool = typeof source.tool === 'string' && source.tool ? source.tool : 'unknown';
  const input = isObject(source.input) ? source.input : {};
  const payload = source.payload;
  const ok = source.ok === true;
  const errorCode = typeof source.errorCode === 'string' ? source.errorCode : undefined;
  const durationMs =
    typeof source.durationMs === 'number' && isFinite(source.durationMs) ? source.durationMs : 0;

  let cellIds: string[] = [];
  try {
    cellIds = collectCellIds(payload, input);
  } catch {
    cellIds = [];
  }

  let notebookPath: string | null = null;
  try {
    notebookPath = extractNotebookPath(payload, input);
  } catch {
    notebookPath = null;
  }

  let outputIndex: number | undefined;
  try {
    outputIndex = extractOutputIndex(payload, input);
  } catch {
    outputIndex = undefined;
  }

  let summary: string;
  try {
    summary = ok ? successSummary(tool, payload, input) : failureSummary(tool, errorCode);
  } catch {
    summary = ok ? 'did something in the notebook' : 'could not complete that action';
  }

  const event: Omit<IActivityEvent, 'id' | 'at' | 'participantId'> = {
    tool,
    kind: activityKindFor(tool),
    ok,
    notebookPath,
    cellIds,
    summary,
    durationMs
  };
  if (!ok && errorCode) {
    event.errorCode = errorCode;
  }
  if (outputIndex !== undefined) {
    event.outputIndex = outputIndex;
  }
  return event;
}

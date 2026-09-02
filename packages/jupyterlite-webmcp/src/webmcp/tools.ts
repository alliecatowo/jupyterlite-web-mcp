import { cellAccess, IMetadataCell } from '../access/guard';
import {
  deleteCell,
  exportNotebook,
  getCellAccess,
  getCells,
  insertCell,
  updateCell
} from '../jupyter/cells';
import { toolError } from '../jupyter/errors';
import { EXPORT_FORMATS } from '../jupyter/export';
import { kernelAction, runCells } from '../jupyter/execution';
import { focusCell, getContext, readFocus, revealCell } from '../jupyter/focus';
import { OutputSelectionTracker } from '../selection/capture';
import {
  createNotebook,
  kernelInfo,
  notebookInfo,
  resolveNotebook,
  saveNotebook
} from '../jupyter/notebook';
import { IJupyterEnv, listWorkspace } from '../jupyter/workspace';
import { LIMITS } from '../limits';
import { makeSourceAnchor, positionAt } from '../review/anchors';
import { scrollOutputIntoView } from '../review/panel';
import {
  AGENT_AUTHOR,
  AnchorKind,
  IAnchor,
  ISourceRange,
  IThread,
  ThreadStatus
} from '../review/model';
import { ReviewStore } from '../review/storage';
import { IToolDefinition } from './types';
import { SCHEMAS } from './schemas';

type Input = Record<string, unknown>;

function optionalString(input: Input, key: string): string | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw toolError('INVALID_ARGUMENT', `"${key}" must be a string.`);
  }
  return value;
}

function requiredString(input: Input, key: string): string {
  const value = optionalString(input, key);
  if (value === null || value === '') {
    throw toolError('INVALID_ARGUMENT', `"${key}" is required.`);
  }
  return value;
}

function optionalStringArray(input: Input, key: string): string[] | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw toolError('INVALID_ARGUMENT', `"${key}" must be an array of strings.`);
  }
  return value as string[];
}

function optionalNumber(input: Input, key: string): number | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !isFinite(value)) {
    throw toolError('INVALID_ARGUMENT', `"${key}" must be a number.`);
  }
  return value;
}

function optionalBoolean(input: Input, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw toolError('INVALID_ARGUMENT', `"${key}" must be a boolean.`);
  }
  return value;
}

function readRange(value: unknown, key: string): ISourceRange | null {
  if (value === undefined || value === null) {
    return null;
  }
  const range = value as ISourceRange;
  const ok =
    range.start &&
    range.end &&
    typeof range.start.line === 'number' &&
    typeof range.start.column === 'number' &&
    typeof range.end.line === 'number' &&
    typeof range.end.column === 'number';
  if (!ok) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" must be {start:{line,column}, end:{line,column}}.`
    );
  }
  return {
    start: { line: range.start.line, column: range.start.column },
    end: { line: range.end.line, column: range.end.column }
  };
}

/** UTF-8 byte length of `value`, used by the byte-bounded string checks below. */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Validates that an optional string argument does not exceed `maxBytes` of
 * UTF-8. Every free-text tool input (a message, a name, a source) must be
 * bounded this way and rejected outright when it is not: the advertised
 * schema cannot be trusted to enforce this by itself (see the module-level
 * note on `jupyter_get_cells({ startIndex: -1 })`), and silently truncating
 * real content a human will keep is worse than refusing it.
 */
function boundedText(input: Input, key: string, maxBytes: number): string | null {
  const value = optionalString(input, key);
  if (value === null) {
    return null;
  }
  if (utf8Bytes(value) > maxBytes) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" exceeds the maximum size of ${maxBytes} bytes.`,
      { key, bytes: utf8Bytes(value) }
    );
  }
  return value;
}

/** Like {@link boundedText}, but the argument is required and non-empty. */
function requiredBoundedText(input: Input, key: string, maxBytes: number): string {
  const value = requiredString(input, key);
  if (utf8Bytes(value) > maxBytes) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" exceeds the maximum size of ${maxBytes} bytes.`,
      { key, bytes: utf8Bytes(value) }
    );
  }
  return value;
}

/** Validates an optional integer argument, rejecting rather than clamping. */
function boundedInteger(
  input: Input,
  key: string,
  opts: { min?: number; max?: number } = {}
): number | null {
  const value = optionalNumber(input, key);
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    throw toolError('INVALID_ARGUMENT', `"${key}" must be an integer.`, { [key]: value });
  }
  if (opts.min !== undefined && value < opts.min) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" must be >= ${opts.min}, got ${value}.`,
      { [key]: value }
    );
  }
  if (opts.max !== undefined && value > opts.max) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" must be <= ${opts.max}, got ${value}.`,
      { [key]: value }
    );
  }
  return value;
}

/** Validates a required string argument is one of a closed set of values. */
function requiredEnum<T extends string>(input: Input, key: string, allowed: readonly T[]): T {
  const value = requiredString(input, key);
  if ((allowed as readonly string[]).indexOf(value) === -1) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" must be one of: ${allowed.join(', ')}.`,
      { [key]: value }
    );
  }
  return value as T;
}

/** Like {@link requiredEnum}, but the argument is optional. */
function optionalEnum<T extends string>(input: Input, key: string, allowed: readonly T[]): T | null {
  const value = optionalString(input, key);
  if (value === null) {
    return null;
  }
  if ((allowed as readonly string[]).indexOf(value) === -1) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" must be one of: ${allowed.join(', ')}.`,
      { [key]: value }
    );
  }
  return value as T;
}

/** Closed set of `jupyter_kernel_action` actions, mirroring `SCHEMAS`. */
const KERNEL_ACTIONS = ['interrupt', 'restart'] as const;

/** Closed set of `jupyter_list_comments` `status` values. */
const COMMENT_STATUSES = ['open', 'resolved', 'all'] as const;

/** Closed set of `jupyter_list_comments` `scope` values. */
const COMMENT_SCOPES = ['notebook', 'current-cell'] as const;

/** Closed set of `jupyter_create_comment` anchor `kind` values. */
const ANCHOR_KINDS = ['cell', 'source-range', 'output'] as const;


/** Bounded summary of a thread, used by the list tool. */
function threadSummary(
  store: ReviewStore,
  panel: Parameters<ReviewStore['anchorStatus']>[0],
  thread: IThread
): Record<string, unknown> {
  const status = store.anchorStatus(panel, thread);
  const last = thread.messages[thread.messages.length - 1];
  return {
    threadId: thread.id,
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
    anchor: {
      kind: thread.anchor.kind,
      cellId: thread.anchor.cellId,
      cellIndex: status.cellIndex,
      selectedText: thread.anchor.selectedText,
      outputIndex: thread.anchor.outputIndex,
      state: status.state,
      outputChanged: status.outputChanged
    },
    lastMessage: last
      ? {
          author: last.author,
          createdAt: last.createdAt,
          body: last.body.slice(0, LIMITS.MAX_PREVIEW_CHARS)
        }
      : null
  };
}

/**
 * Build every tool the extension exposes.
 *
 * Each handler is a thin wrapper: argument checking, then a call into the
 * semantic Jupyter or review operation, then a plain JSON payload.
 */
export function buildTools(
  env: IJupyterEnv,
  review: ReviewStore,
  outputSelection?: OutputSelectionTracker
): IToolDefinition[] {
  const counts = (panel: Parameters<ReviewStore['counts']>[0]) =>
    review.counts(panel);

  const tools: IToolDefinition[] = [
    {
      name: 'jupyter_get_context',
      title: 'Get notebook context',
      description:
        'Read the live state of the browser-local Jupyter workspace: the open documents, the current notebook (including whether it has unsaved changes), the kernel status, the active and selected cells, the cursor, and the exact text the user currently has selected. Call this first; the selection is how the user points at something when they say "this".',
      inputSchema: SCHEMAS.jupyter_get_context,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async () => getContext(env, counts)
    },

    {
      name: 'jupyter_list_workspace',
      title: 'List workspace files',
      description:
        'List files and directories in the browser-local workspace. Returns names, paths, types, sizes and modification times, never file contents. Use it to find a notebook before opening it.',
      inputSchema: SCHEMAS.jupyter_list_workspace,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async input =>
        listWorkspace(env, {
          path: optionalString(input, 'path'),
          recursive: optionalBoolean(input, 'recursive') === true,
          limit:
            boundedInteger(input, 'limit', { min: 1, max: LIMITS.MAX_WORKSPACE_ROWS }) ??
            undefined
        })
    },

    {
      name: 'jupyter_open_notebook',
      title: 'Open a notebook',
      description:
        'Open a notebook from the workspace and bring it to the front, optionally scrolling to a specific cell. This visibly changes what the user is looking at.',
      inputSchema: SCHEMAS.jupyter_open_notebook,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input => {
        const path = requiredString(input, 'path');
        const cellId = optionalString(input, 'cellId');
        const activate = optionalBoolean(input, 'activate') !== false;
        const panel = await resolveNotebook(env, path, { activate });
        if (cellId) {
          await focusCell(env, { notebookPath: panel.context.path, cellId });
        }
        return {
          notebook: notebookInfo(panel),
          kernel: kernelInfo(panel),
          focus: readFocus(panel),
          review: counts(panel)
        };
      }
    },

    {
      name: 'jupyter_create_notebook',
      title: 'Create a notebook',
      description:
        'Create a new, empty notebook in the browser-local workspace and open it. Refuses to overwrite an existing file.',
      inputSchema: SCHEMAS.jupyter_create_notebook,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      handler: async input => {
        const created = await createNotebook(env, {
          name: requiredBoundedText(input, 'name', LIMITS.MAX_NAME_BYTES),
          directory: optionalString(input, 'directory'),
          kernel: optionalString(input, 'kernel')
        });
        return {
          path: created.path,
          notebook: notebookInfo(created.panel),
          kernel: kernelInfo(created.panel)
        };
      }
    },

    {
      name: 'jupyter_get_cells',
      title: 'Read notebook cells',
      description:
        'Read cells from the live notebook model, including edits the user has not saved yet. Each cell comes back with its stable id and a sourceHash; you must pass that hash back to edit or delete the cell. Outputs are bounded and only included when asked for.',
      inputSchema: SCHEMAS.jupyter_get_cells,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async input =>
        getCells(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          cellIds: optionalStringArray(input, 'cellIds'),
          startIndex: boundedInteger(input, 'startIndex', { min: 0 }),
          endIndex: boundedInteger(input, 'endIndex', { min: 0 }),
          includeSource: optionalBoolean(input, 'includeSource') !== false,
          includeOutputs: optionalBoolean(input, 'includeOutputs') === true
        })
    },

    {
      name: 'jupyter_get_cell_access',
      title: 'Read cell agent access',
      description:
        'Report what a connected agent may currently do with each cell (write, read, or none) plus its full provenance history, and how many cells in range are hidden entirely. The notebook owner controls this per cell from the cell context menu; there is no tool to change it. Use this to explain to the user why you are not touching a cell.',
      inputSchema: SCHEMAS.jupyter_get_cell_access,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async input =>
        getCellAccess(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          cellIds: optionalStringArray(input, 'cellIds'),
          startIndex: boundedInteger(input, 'startIndex', { min: 0 }),
          endIndex: boundedInteger(input, 'endIndex', { min: 0 })
        })
    },

    {
      name: 'jupyter_insert_cell',
      title: 'Insert a cell',
      description:
        'Insert a new cell into the live notebook, above or below a reference cell. The cell is visible to the user immediately. It is not executed: run it with jupyter_run_cells as a separate, explicit step.',
      inputSchema: SCHEMAS.jupyter_insert_cell,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input =>
        insertCell(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          referenceCellId: optionalString(input, 'referenceCellId'),
          position:
            (optionalString(input, 'position') as 'above' | 'below') ?? 'below',
          cellType: optionalString(input, 'cellType') ?? 'code',
          source: optionalString(input, 'source') ?? '',
          activate: optionalBoolean(input, 'activate')
        })
    },

    {
      name: 'jupyter_update_cell',
      title: 'Update a cell',
      description:
        'Replace the source of a visible notebook cell in the live model. Requires the sourceHash returned by a previous read, so an unsaved human edit can never be overwritten by accident: if the cell changed, the write is refused with a STALE_CELL error containing the current hash and a preview. Does not run or save the cell.',
      inputSchema: SCHEMAS.jupyter_update_cell,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input =>
        updateCell(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          cellId: requiredString(input, 'cellId'),
          source: (input.source as string) ?? '',
          expectedSourceHash: requiredString(input, 'expectedSourceHash')
        })
    },

    {
      name: 'jupyter_delete_cell',
      title: 'Delete a cell',
      description:
        'Delete a visible notebook cell. Requires the sourceHash from a previous read; a cell the user has edited since then is not deleted.',
      inputSchema: SCHEMAS.jupyter_delete_cell,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input =>
        deleteCell(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          cellId: requiredString(input, 'cellId'),
          expectedSourceHash: requiredString(input, 'expectedSourceHash')
        })
    },

    {
      name: 'jupyter_run_cells',
      title: 'Run notebook cells',
      description:
        'Execute cells that already exist in the notebook, using the browser-local kernel the user shares. Select them with cellIds, or with an explicit contiguous startIndex/endIndex range; if no selector is given, the active cell runs. The user sees the busy state, the execution counts and the outputs. There is no way to run an arbitrary source string: to compute something new, insert a visible cell first and then run it.',
      inputSchema: SCHEMAS.jupyter_run_cells,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async (input, options) =>
        runCells(
          env,
          {
            notebookPath: optionalString(input, 'notebookPath'),
            cellIds: optionalStringArray(input, 'cellIds'),
            startIndex: boundedInteger(input, 'startIndex', { min: 0 }),
            endIndex: boundedInteger(input, 'endIndex', { min: 0 }),
            stopOnError: optionalBoolean(input, 'stopOnError') !== false
          },
          options.signal
        )
    },

    {
      name: 'jupyter_focus_cell',
      title: 'Focus a cell',
      description:
        'Scroll to a cell, select it, and optionally place the cursor or select an exact range of its source using the notebook editor’s own selection. Use it to point the user at the code you are talking about. Changes only what is on screen.',
      inputSchema: SCHEMAS.jupyter_focus_cell,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input =>
        focusCell(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          cellId: requiredString(input, 'cellId'),
          cursor: readRange(
            input.cursor
              ? { start: input.cursor, end: input.cursor }
              : null,
            'cursor'
          )?.start,
          selection: readRange(input.selection, 'selection')
        })
    },

    {
      name: 'jupyter_save_notebook',
      title: 'Save the notebook',
      description:
        'Save the notebook to the browser-local workspace. The live in-memory model is authoritative, so this is only needed when the user wants the file on disk updated.',
      inputSchema: SCHEMAS.jupyter_save_notebook,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      handler: async input =>
        saveNotebook(env, optionalString(input, 'notebookPath'))
    },

    {
      name: 'jupyter_kernel_action',
      title: 'Interrupt or restart the kernel',
      description:
        'Interrupt or restart the browser-local kernel for a notebook. The kernel is shared with the user, so an interrupt also stops anything they started. Restarting discards every in-memory variable.',
      inputSchema: SCHEMAS.jupyter_kernel_action,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      handler: async input =>
        kernelAction(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          action: requiredEnum(input, 'action', KERNEL_ACTIONS)
        })
    },

    {
      name: 'jupyter_list_comments',
      title: 'List review comments',
      description:
        'List the review threads stored in a notebook. Threads are an ordinary notebook feature the user can also create, reply to and resolve by hand; they are saved in the notebook file. Each summary says whether the thread still points at live code or has become orphaned.',
      inputSchema: SCHEMAS.jupyter_list_comments,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath')
        );
        const scope = optionalEnum(input, 'scope', COMMENT_SCOPES) ?? 'notebook';
        const status = (optionalEnum(input, 'status', COMMENT_STATUSES) ??
          'open') as ThreadStatus | 'all';
        const limit =
          boundedInteger(input, 'limit', { min: 1, max: LIMITS.MAX_COMMENTS_RETURNED }) ??
          LIMITS.MAX_COMMENTS_RETURNED;
        const cellId =
          scope === 'current-cell'
            ? (panel.content.activeCell?.model.id ?? null)
            : null;
        if (scope === 'current-cell' && !cellId) {
          throw toolError(
            'NO_ACTIVE_NOTEBOOK',
            'There is no active cell to scope the comments to.'
          );
        }
        const all = review.listThreads(panel, { status, cellId });
        const threads = all.slice(0, limit);
        return {
          notebookPath: panel.context.path,
          counts: review.counts(panel),
          threads: threads.map(thread =>
            threadSummary(review, panel, thread)
          ),
          truncated: all.length > threads.length,
          omittedCount: all.length - threads.length
        };
      }
    },

    {
      name: 'jupyter_get_comment',
      title: 'Read a review thread',
      description:
        'Read one review thread in full: every message, the anchor, whether the anchor still resolves, and the code or output it is attached to as it exists now.',
      inputSchema: SCHEMAS.jupyter_get_comment,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath')
        );
        const thread = review.requireThread(
          panel,
          requiredString(input, 'threadId')
        );
        const status = review.anchorStatus(panel, thread);
        const context: Record<string, unknown> = {};
        let hiddenCellCount = 0;
        if (status.cellIndex !== null) {
          const cellModel = panel.context.model.cells.get(
            status.cellIndex
          ) as unknown as IMetadataCell;
          if (cellAccess(cellModel) === 'none') {
            // Same rule as `jupyter_get_cells`: a cell the notebook owner
            // hid from the agent is omitted, never silently — the omission
            // is reported instead of leaking its source/outputs here.
            hiddenCellCount = 1;
          } else {
            const cells = await getCells(env, {
              notebookPath: panel.context.path,
              cellIds: [thread.anchor.cellId],
              includeSource: true,
              includeOutputs: thread.anchor.kind === 'output'
            });
            context.cell = cells.cells[0];
          }
        }
        return {
          notebookPath: panel.context.path,
          thread,
          anchorStatus: status,
          context,
          hiddenCellCount
        };
      }
    },

    {
      name: 'jupyter_create_comment',
      title: 'Create a review comment',
      description:
        'Create a review thread anchored to a whole cell, to an exact range of a cell’s source, or to one of a cell’s outputs. This is the same kind of comment the user creates from the Review panel, so use it to leave observations without editing their notebook.',
      inputSchema: SCHEMAS.jupyter_create_comment,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath')
        );
        const rawAnchor = (input.anchor ?? {}) as Input;
        const kind = requiredEnum(rawAnchor, 'kind', ANCHOR_KINDS) as AnchorKind;
        const cellId = requiredString(rawAnchor, 'cellId');
        let anchor: IAnchor = { kind, cellId };

        if (kind === 'source-range') {
          const index = panel.context.model.cells;
          let source = '';
          for (let i = 0; i < index.length; i++) {
            if (index.get(i).id === cellId) {
              source = index.get(i).sharedModel.getSource();
              break;
            }
          }
          const explicit = readRange(rawAnchor.selection, 'anchor.selection');
          const text = boundedText(rawAnchor, 'text', LIMITS.MAX_SELECTED_TEXT_BYTES);
          let range: ISourceRange;
          if (explicit) {
            range = explicit;
          } else if (text) {
            const at = source.indexOf(text);
            if (at === -1) {
              throw toolError(
                'COMMENT_ANCHOR_STALE',
                'That text does not appear in the cell source.',
                { cellId }
              );
            }
            range = {
              start: positionAt(source, at),
              end: positionAt(source, at + text.length)
            };
          } else {
            throw toolError(
              'INVALID_ARGUMENT',
              'A source-range anchor needs either anchor.text or anchor.selection.'
            );
          }
          anchor = makeSourceAnchor(cellId, source, range);
        } else if (kind === 'output') {
          const outputIndex =
            boundedInteger(rawAnchor, 'outputIndex', { min: 0 }) ?? 0;
          anchor = review.buildOutputAnchor(panel, cellId, outputIndex);
        }

        const thread = review.createThread(
          panel,
          anchor,
          requiredBoundedText(input, 'message', LIMITS.MAX_COMMENT_BODY_BYTES),
          AGENT_AUTHOR
        );
        return {
          notebookPath: panel.context.path,
          thread,
          counts: review.counts(panel)
        };
      }
    },

    {
      name: 'jupyter_reply_comment',
      title: 'Reply to a review thread',
      description:
        'Append a message to an existing review thread. The user sees it in the Review panel next to their own messages.',
      inputSchema: SCHEMAS.jupyter_reply_comment,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath')
        );
        const thread = review.reply(
          panel,
          requiredString(input, 'threadId'),
          requiredBoundedText(input, 'message', LIMITS.MAX_COMMENT_BODY_BYTES),
          AGENT_AUTHOR
        );
        return { notebookPath: panel.context.path, thread };
      }
    },

    {
      name: 'jupyter_resolve_comment',
      title: 'Resolve a review thread',
      description:
        'Mark a review thread resolved, optionally adding a closing message. The history is preserved and the user can reopen it.',
      inputSchema: SCHEMAS.jupyter_resolve_comment,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath')
        );
        const thread = review.setStatus(
          panel,
          requiredString(input, 'threadId'),
          'resolved',
          boundedText(input, 'resolutionMessage', LIMITS.MAX_COMMENT_BODY_BYTES),
          AGENT_AUTHOR
        );
        return { notebookPath: panel.context.path, thread };
      }
    },

    {
      name: 'jupyter_reopen_comment',
      title: 'Reopen a review thread',
      description: 'Reopen a resolved review thread, preserving its history.',
      inputSchema: SCHEMAS.jupyter_reopen_comment,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath')
        );
        const thread = review.setStatus(
          panel,
          requiredString(input, 'threadId'),
          'open'
        );
        return { notebookPath: panel.context.path, thread };
      }
    },

    {
      name: 'jupyter_focus_comment',
      title: 'Focus a review thread',
      description:
        'Scroll to what a review thread is attached to and select it, so the user can see exactly which code or output is under discussion. Changes only what is on screen.',
      inputSchema: SCHEMAS.jupyter_focus_comment,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      handler: async input => {
        const panel = await resolveNotebook(
          env,
          optionalString(input, 'notebookPath'),
          { activate: true }
        );
        const thread = review.requireThread(
          panel,
          requiredString(input, 'threadId')
        );
        const status = review.anchorStatus(panel, thread);
        if (status.cellIndex === null) {
          throw toolError(
            'COMMENT_ANCHOR_STALE',
            'The cell this thread was attached to no longer exists.',
            { threadId: thread.id }
          );
        }
        const cell = await revealCell(panel, status.cellIndex);
        if (cell?.editor && status.range) {
          cell.editor.focus();
          cell.editor.setSelection(
            status.range as unknown as Parameters<
              typeof cell.editor.setSelection
            >[0]
          );
        } else if (thread.anchor.kind === 'output') {
          scrollOutputIntoView(cell, status.outputIndex);
        }
        return {
          notebookPath: panel.context.path,
          threadId: thread.id,
          anchorStatus: status,
          notebook: notebookInfo(panel)
        };
      }
    },

    {
      name: 'jupyter_export_notebook',
      title: 'Export the notebook',
      description:
        'Export the notebook as a portable markdown document: markdown cells verbatim, code cells as fenced code blocks, and (by default) their text and error outputs, with images represented only by a placeholder, never embedded. Use this to hand the notebook to another tool (upload it, email it, put it in a document) without a manual export.',
      inputSchema: SCHEMAS.jupyter_export_notebook,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async input =>
        exportNotebook(env, {
          notebookPath: optionalString(input, 'notebookPath'),
          format: optionalEnum(input, 'format', EXPORT_FORMATS) ?? 'markdown',
          includeOutputs: optionalBoolean(input, 'includeOutputs') !== false
        })
    }
  ];

  if (outputSelection) {
    tools.push({
      name: 'jupyter_get_output_selection',
      title: 'Read the selected output',
      description:
        'Read the text the user last selected inside a rendered cell output, if any is currently recorded. Returns null when nothing is selected, the selection crossed cells or notebook chrome, or it no longer matches the output it was taken from.',
      inputSchema: SCHEMAS.jupyter_get_output_selection,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      handler: async () => outputSelection.current
    });
  }

  return tools;
}

/** Exported for the unit tests: the tool names this extension registers. */
export const TOOL_NAMES = Object.keys(SCHEMAS);

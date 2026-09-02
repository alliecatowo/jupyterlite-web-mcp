import { Cell } from '@jupyterlab/cells';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { NotebookPanel } from '@jupyterlab/notebook';

import { resolveCellIndex } from '../access/guard';
import { LIMITS } from '../limits';
import { toolError } from './errors';
import {
  IKernelInfo,
  INotebookInfo,
  kernelInfo,
  notebookInfo,
  resolveNotebook
} from './notebook';
import { currentDirectory, IJupyterEnv, openDocuments } from './workspace';

/** A zero-based editor position. */
export interface IPosition {
  /** Zero-based line. */
  line: number;
  /** Zero-based column. */
  column: number;
}

/** A text selection inside a single cell editor. */
export interface ITextSelection {
  /** Start of the selection. */
  start: IPosition;
  /** End of the selection. */
  end: IPosition;
  /** The selected text, bounded. */
  text: string;
  /** Whether `text` was truncated. */
  truncated?: boolean;
}

/** What the human currently has focused in the notebook. */
export interface IFocusContext {
  /** Id of the active cell, or `null`. */
  activeCellId: string | null;
  /** Index of the active cell, or `null`. */
  activeCellIndex: number | null;
  /** Type of the active cell, or `null`. */
  activeCellType: string | null;
  /** Ids of every selected cell (includes the active cell). */
  selectedCellIds: string[];
  /** Cursor position inside the active cell editor. */
  cursor: IPosition | null;
  /** Non-empty source selection inside the active cell editor. */
  textSelection: ITextSelection | null;
}

/** The full bounded context returned by `jupyter_get_context`. */
export interface IWorkspaceContext {
  /** Workspace-level state. */
  workspace: { currentDirectory: string; openDocuments: string[] };
  /** The current notebook, or `null` when none is open. */
  notebook: INotebookInfo | null;
  /** The kernel behind the current notebook, or `null`. */
  kernel: IKernelInfo | null;
  /** Focus and selection state, or `null` when no notebook is open. */
  focus: IFocusContext | null;
  /** Review thread counts for the current notebook. */
  review: { openThreads: number; totalThreads: number } | null;
}

/**
 * Activate a cell, scroll it into view and wait until its editor exists.
 *
 * Notebooks are windowed by default in JupyterLab 4, so a cell that is far
 * off-screen may not have a live editor until it has been scrolled to.
 */
export async function revealCell(
  panel: NotebookPanel,
  index: number
): Promise<Cell | null> {
  const notebook = panel.content;
  if (index < 0 || index >= notebook.widgets.length) {
    return null;
  }
  notebook.activeCellIndex = index;
  notebook.deselectAll();
  try {
    await notebook.scrollToItem(index, 'center');
  } catch {
    // Windowing may be disabled, in which case the cell is already laid out.
  }
  const cell = notebook.widgets[index] ?? null;
  if (cell) {
    try {
      await cell.ready;
    } catch {
      // A disposed cell simply has no editor; callers handle `null`.
    }
  }
  return cell;
}

function boundedSelectionText(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= LIMITS.MAX_SELECTED_TEXT_BYTES) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, LIMITS.MAX_SELECTED_TEXT_BYTES),
    truncated: true
  };
}

function readTextSelection(
  editor: CodeEditor.IEditor
): ITextSelection | null {
  const selection = editor.getSelection();
  if (!selection) {
    return null;
  }
  const startOffset = editor.getOffsetAt(selection.start);
  const endOffset = editor.getOffsetAt(selection.end);
  if (startOffset === endOffset) {
    return null;
  }
  const from = Math.min(startOffset, endOffset);
  const to = Math.max(startOffset, endOffset);
  const source = editor.model.sharedModel.getSource();
  const bounded = boundedSelectionText(source.slice(from, to));
  const result: ITextSelection = {
    start: editor.getPositionAt(from) ?? selection.start,
    end: editor.getPositionAt(to) ?? selection.end,
    text: bounded.text
  };
  if (bounded.truncated) {
    result.truncated = true;
  }
  return result;
}

/** Read the human's current focus inside a notebook panel. */
export function readFocus(panel: NotebookPanel): IFocusContext {
  const notebook = panel.content;
  const activeCell = notebook.activeCell;
  const selectedCellIds: string[] = [];
  for (let i = 0; i < notebook.widgets.length; i++) {
    const widget = notebook.widgets[i];
    if (notebook.isSelectedOrActive(widget)) {
      selectedCellIds.push(widget.model.id);
    }
  }

  const editor = activeCell?.editor ?? null;
  return {
    activeCellId: activeCell ? activeCell.model.id : null,
    activeCellIndex: activeCell ? notebook.activeCellIndex : null,
    activeCellType: activeCell ? activeCell.model.type : null,
    selectedCellIds,
    cursor: editor ? editor.getCursorPosition() : null,
    textSelection: editor ? readTextSelection(editor) : null
  };
}

/**
 * Gather the bounded live context of the workspace.
 *
 * This never opens or changes anything; it is the read the agent performs
 * before deciding what to do.
 */
export async function getContext(
  env: IJupyterEnv,
  reviewCounts?: (
    panel: NotebookPanel
  ) => { openThreads: number; totalThreads: number }
): Promise<IWorkspaceContext> {
  const panel = env.tracker.currentWidget;
  const workspace = {
    currentDirectory: currentDirectory(env),
    openDocuments: openDocuments(env)
  };

  if (!panel) {
    return {
      workspace,
      notebook: null,
      kernel: null,
      focus: null,
      review: null
    };
  }
  await panel.context.ready;

  return {
    workspace,
    notebook: notebookInfo(panel),
    kernel: kernelInfo(panel),
    focus: readFocus(panel),
    review: reviewCounts ? reviewCounts(panel) : null
  };
}

/**
 * Rejects a `{line, column}` position whose fields are not non-negative
 * integers, rather than passing a malformed position through to the editor.
 */
function checkPosition(position: IPosition | null | undefined, key: string): void {
  if (!position) {
    return;
  }
  const { line, column } = position;
  if (!Number.isInteger(line) || line < 0 || !Number.isInteger(column) || column < 0) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"${key}" must be {line, column} with non-negative integers.`,
      { [key]: position }
    );
  }
}

/**
 * Point the human at a specific cell, and optionally at an exact expression
 * inside it, using the notebook's own selection rendering.
 */
export async function focusCell(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    cellId: string;
    cursor?: IPosition | null;
    selection?: { start: IPosition; end: IPosition } | null;
  }
): Promise<{ notebook: INotebookInfo; focus: IFocusContext }> {
  checkPosition(params.cursor, 'cursor');
  if (params.selection) {
    checkPosition(params.selection.start, 'selection.start');
    checkPosition(params.selection.end, 'selection.end');
  }
  const panel = await resolveNotebook(env, params.notebookPath, {
    activate: true
  });
  // `'read'`: a cell the notebook owner restricted to read-only can still be
  // pointed at — only a `'none'` cell is refused, exactly like a bad id
  // (CELL_NOT_FOUND), since the agent isn't supposed to know it exists.
  const index = resolveCellIndex(panel, params.cellId, 'read');

  const cell = await revealCell(panel, index);
  const editor = cell?.editor ?? null;
  if (editor) {
    editor.focus();
    if (params.selection) {
      editor.setSelection({
        start: params.selection.start,
        end: params.selection.end
      } as unknown as CodeEditor.IRange);
    } else if (params.cursor) {
      editor.setCursorPosition(
        params.cursor as unknown as CodeEditor.IPosition
      );
    }
  }

  return { notebook: notebookInfo(panel), focus: readFocus(panel) };
}

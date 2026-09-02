import { ICodeCellModel, MarkdownCell } from '@jupyterlab/cells';
import { INotebookModel, NotebookPanel } from '@jupyterlab/notebook';

import { LIMITS } from '../limits';
import { toolError } from './errors';
import { revealCell } from './focus';
import { INotebookInfo, notebookInfo, resolveNotebook } from './notebook';
import { ISerializedOutput, serializeOutputs } from './outputs';
import { hashCellSource } from './revisions';
import { IJupyterEnv } from './workspace';

/** Cell types a tool may create. */
const CELL_TYPES = ['code', 'markdown', 'raw'];

/** A bounded view of one live notebook cell. */
export interface ICellSnapshot {
  /** Stable nbformat cell id. */
  id: string;
  /** Zero-based position in the notebook. */
  index: number;
  /** `code`, `markdown` or `raw`. */
  type: string;
  /** Live source, bounded. Omitted when the caller opted out. */
  source?: string;
  /** Whether `source` was truncated. */
  sourceTruncated?: boolean;
  /** Hash of the live source, required to write the cell back. */
  sourceHash: string;
  /** Execution count for code cells. */
  executionCount?: number | null;
  /** Serialized outputs, bounded. Omitted when the caller opted out. */
  outputs?: ISerializedOutput[];
  /** Whether outputs were truncated or omitted. */
  outputsTruncated?: boolean;
  /** Small cell metadata, omitted when large. */
  metadata?: Record<string, unknown>;
}

/** Find a cell by its stable id, or `-1`. */
export function findCellIndexById(
  model: INotebookModel,
  cellId: string
): number {
  for (let i = 0; i < model.cells.length; i++) {
    if (model.cells.get(i).id === cellId) {
      return i;
    }
  }
  return -1;
}

/** Find a cell by id or throw a structured `CELL_NOT_FOUND`. */
export function requireCellIndex(
  panel: NotebookPanel,
  cellId: string
): number {
  const index = findCellIndexById(panel.context.model, cellId);
  if (index === -1) {
    throw toolError(
      'CELL_NOT_FOUND',
      `No cell with id "${cellId}" in "${panel.context.path}".`,
      { cellId, notebookPath: panel.context.path }
    );
  }
  return index;
}

function boundSource(source: string): { text: string; truncated: boolean } {
  if (source.length <= LIMITS.MAX_CELL_SOURCE_BYTES) {
    return { text: source, truncated: false };
  }
  return {
    text: source.slice(0, LIMITS.MAX_CELL_SOURCE_BYTES),
    truncated: true
  };
}

/** Read a bounded snapshot of the live cell at `index`. */
export function snapshotCell(
  model: INotebookModel,
  index: number,
  options: { includeSource?: boolean; includeOutputs?: boolean } = {}
): ICellSnapshot {
  const cell = model.cells.get(index);
  const source = cell.sharedModel.getSource();
  const snapshot: ICellSnapshot = {
    id: cell.id,
    index,
    type: cell.type,
    sourceHash: hashCellSource(cell.type, source)
  };

  if (options.includeSource !== false) {
    const bounded = boundSource(source);
    snapshot.source = bounded.text;
    if (bounded.truncated) {
      snapshot.sourceTruncated = true;
    }
  }

  if (cell.type === 'code') {
    snapshot.executionCount = (cell as ICodeCellModel).executionCount ?? null;
    if (options.includeOutputs) {
      const raw = (cell.sharedModel.toJSON() as { outputs?: unknown[] })
        .outputs;
      const serialized = serializeOutputs(raw ?? []);
      snapshot.outputs = serialized.outputs;
      if (serialized.truncated) {
        snapshot.outputsTruncated = true;
      }
    }
  }

  const metadata = (
    cell.sharedModel.toJSON() as { metadata?: Record<string, unknown> }
  ).metadata;
  if (metadata) {
    const encoded = JSON.stringify(metadata);
    if (encoded && encoded.length <= 512 && encoded !== '{}') {
      snapshot.metadata = metadata;
    }
  }

  return snapshot;
}

/** Read cells from the live notebook model, including unsaved edits. */
export async function getCells(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    cellIds?: string[] | null;
    startIndex?: number | null;
    endIndex?: number | null;
    includeSource?: boolean;
    includeOutputs?: boolean;
  } = {}
): Promise<{
  notebook: INotebookInfo;
  cells: ICellSnapshot[];
  truncated: boolean;
  omittedCount: number;
}> {
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const options = {
    includeSource: params.includeSource !== false,
    includeOutputs: params.includeOutputs === true
  };

  let indices: number[] = [];
  if (params.cellIds && params.cellIds.length > 0) {
    for (let i = 0; i < params.cellIds.length; i++) {
      indices.push(requireCellIndex(panel, params.cellIds[i]));
    }
  } else {
    const start = Math.max(0, params.startIndex ?? 0);
    const end = Math.min(
      params.endIndex ?? start + LIMITS.DEFAULT_CELLS_RETURNED,
      model.cells.length
    );
    for (let i = start; i < end; i++) {
      indices.push(i);
    }
  }

  let omittedCount = 0;
  if (indices.length > LIMITS.MAX_CELLS_RETURNED) {
    omittedCount = indices.length - LIMITS.MAX_CELLS_RETURNED;
    indices = indices.slice(0, LIMITS.MAX_CELLS_RETURNED);
  }

  const cells = indices.map(index => snapshotCell(model, index, options));
  return {
    notebook: notebookInfo(panel),
    cells,
    truncated: omittedCount > 0,
    omittedCount
  };
}

/** Insert a new, visible cell into the live notebook. Never executes it. */
export async function insertCell(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    referenceCellId?: string | null;
    position?: 'above' | 'below';
    cellType?: string;
    source?: string;
    activate?: boolean;
  }
): Promise<{ notebook: INotebookInfo; cell: ICellSnapshot }> {
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const notebook = panel.content;
  const cellType = params.cellType ?? 'code';
  const position = params.position ?? 'below';

  if (CELL_TYPES.indexOf(cellType) === -1) {
    throw toolError(
      'INVALID_CELL_TYPE',
      `Invalid cell type "${cellType}". Expected code, markdown or raw.`,
      { cellType }
    );
  }
  if (position !== 'above' && position !== 'below') {
    throw toolError(
      'INVALID_ARGUMENT',
      `Invalid position "${position}". Expected above or below.`,
      { position }
    );
  }

  let insertIndex = model.cells.length;
  if (model.cells.length > 0) {
    const referenceIndex = params.referenceCellId
      ? requireCellIndex(panel, params.referenceCellId)
      : notebook.activeCellIndex;
    const safeReference =
      referenceIndex >= 0 && referenceIndex < model.cells.length
        ? referenceIndex
        : model.cells.length - 1;
    insertIndex = position === 'above' ? safeReference : safeReference + 1;
  }

  model.sharedModel.insertCell(insertIndex, {
    cell_type: cellType as 'code' | 'markdown' | 'raw',
    source: params.source ?? '',
    metadata: cellType === 'code' ? { trusted: true } : {}
  });

  if (params.activate !== false) {
    const widget = await revealCell(panel, insertIndex);
    if (cellType === 'markdown' && params.source && widget) {
      if (widget instanceof MarkdownCell) {
        widget.rendered = true;
      }
    }
  }

  return {
    notebook: notebookInfo(panel),
    cell: snapshotCell(model, insertIndex, { includeSource: true })
  };
}

/**
 * Replace the source of a visible cell in the live model.
 *
 * Requires the hash returned by a previous read so an unsaved human edit can
 * never be silently overwritten.
 */
export async function updateCell(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    cellId: string;
    source: string;
    expectedSourceHash: string;
  }
): Promise<{ notebook: INotebookInfo; cell: ICellSnapshot }> {
  if (typeof params.source !== 'string') {
    throw toolError('INVALID_ARGUMENT', 'source must be a string.');
  }
  if (!params.expectedSourceHash) {
    throw toolError(
      'INVALID_ARGUMENT',
      'expectedSourceHash is required so a concurrent human edit cannot be overwritten.'
    );
  }
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const index = requireCellIndex(panel, params.cellId);
  const cell = model.cells.get(index);
  const currentSource = cell.sharedModel.getSource();
  const currentHash = hashCellSource(cell.type, currentSource);

  if (currentHash !== params.expectedSourceHash) {
    throw toolError('STALE_CELL', 'Cell changed since it was read.', {
      cellId: params.cellId,
      expectedSourceHash: params.expectedSourceHash,
      currentSourceHash: currentHash,
      currentSourcePreview: currentSource.slice(0, LIMITS.MAX_PREVIEW_CHARS)
    });
  }

  cell.sharedModel.setSource(params.source);
  return {
    notebook: notebookInfo(panel),
    cell: snapshotCell(model, index, { includeSource: true })
  };
}

/** Delete a visible cell, refusing to delete one that changed since it was read. */
export async function deleteCell(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    cellId: string;
    expectedSourceHash: string;
  }
): Promise<{
  notebook: INotebookInfo;
  deletedCellId: string;
  activeCellId: string | null;
}> {
  if (!params.expectedSourceHash) {
    throw toolError(
      'INVALID_ARGUMENT',
      'expectedSourceHash is required so a concurrent human edit cannot be discarded.'
    );
  }
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const index = requireCellIndex(panel, params.cellId);
  const cell = model.cells.get(index);
  const currentHash = hashCellSource(cell.type, cell.sharedModel.getSource());

  if (currentHash !== params.expectedSourceHash) {
    throw toolError(
      'STALE_CELL',
      'Cell changed since it was read; it was not deleted.',
      {
        cellId: params.cellId,
        expectedSourceHash: params.expectedSourceHash,
        currentSourceHash: currentHash,
        currentSourcePreview: cell.sharedModel
          .getSource()
          .slice(0, LIMITS.MAX_PREVIEW_CHARS)
      }
    );
  }

  model.sharedModel.deleteCell(index);
  const activeCell = panel.content.activeCell;
  return {
    notebook: notebookInfo(panel),
    deletedCellId: params.cellId,
    activeCellId: activeCell ? activeCell.model.id : null
  };
}

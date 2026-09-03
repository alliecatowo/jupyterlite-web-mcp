import { ICodeCellModel, MarkdownCell } from '@jupyterlab/cells';
import { INotebookModel, NotebookPanel } from '@jupyterlab/notebook';

import {
  AccessIntent,
  assertCellAccessible,
  cellAccess,
  IMetadataCell,
  readCellMetadata,
  recordCellHistory,
  withAgentAttribution
} from '../access/guard';
import { CellAccess, IHistoryEntry } from '../access/model';
import { LIMITS } from '../limits';
import { toolError } from './errors';
import { revealCell } from './focus';
import { INotebookInfo, notebookInfo, resolveNotebook } from './notebook';
import { ISerializedOutput, serializeOutputs } from './outputs';
import { hashCellSource } from './revisions';
import { IJupyterEnv } from './workspace';
import {
  ExportFormat,
  IExportCellInput,
  renderNotebookMarkdown
} from './export';

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
  /** Who last changed this cell, when its provenance history has an entry. */
  lastEditedBy?: IHistoryEntry['actor'];
  /** When they last changed it, when its provenance history has an entry. */
  lastEditedAt?: string;
}

/** Bounded summary of one cell's agent access level and provenance. */
export interface ICellAccessSummary {
  /** Stable nbformat cell id. */
  cellId: string;
  /** Zero-based position in the notebook. */
  index: number;
  /** What a connected agent may currently do with this cell. */
  access: CellAccess;
  /** Bounded, newest-last provenance trail (at most 20 entries). */
  history: IHistoryEntry[];
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

/**
 * Find a cell by id, applying the per-cell agent access check, or throw a
 * structured `CELL_NOT_FOUND`/`CELL_ACCESS_DENIED`.
 *
 * This is the one place every id-addressed tool path in this file (and in
 * `src/jupyter/execution.ts`) resolves a cell index, so the access decision
 * itself lives in a single function: {@link assertCellAccessible}
 * (`src/access/guard.ts`). `intent` defaults to `'write'`, the stricter
 * check, so a call site has to opt into `'read'` deliberately.
 */
export function requireCellIndex(
  panel: NotebookPanel,
  cellId: string,
  intent: AccessIntent = 'write'
): number {
  const index = findCellIndexById(panel.context.model, cellId);
  if (index === -1) {
    throw toolError(
      'CELL_NOT_FOUND',
      `No cell with id "${cellId}" in "${panel.context.path}".`,
      { cellId, notebookPath: panel.context.path }
    );
  }
  const cell = panel.context.model.cells.get(index) as unknown as IMetadataCell;
  assertCellAccessible(cellId, panel.context.path, cellAccess(cell), intent);
  return index;
}

/**
 * Validates and resolves a `startIndex`/`endIndex` cell range against a live
 * notebook, returning the visible cell indices in range plus how many were
 * hidden (`access: "none"`).
 *
 * Deliberately **rejects** an out-of-range request rather than clamping it:
 * a negative `startIndex`/`endIndex`, or an `endIndex` before `startIndex`,
 * is a caller bug that should surface as `INVALID_ARGUMENT`, not be silently
 * reinterpreted as "start from zero" or "empty range". This is the fix for
 * the live-tested defect where `jupyter_get_cells({ startIndex: -1 })` was
 * clamped to `0` even though the advertised schema declares `minimum: 0` —
 * neither the browser nor the host WebMCP runtime is guaranteed to enforce
 * that schema constraint, so the handler must never rely on it.
 */
function resolveCellRange(
  model: INotebookModel,
  startIndex?: number | null,
  endIndex?: number | null
): { indices: number[]; hiddenCellCount: number } {
  const start = startIndex ?? 0;
  if (!Number.isInteger(start) || start < 0) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"startIndex" must be an integer >= 0, got ${start}.`,
      { startIndex: start }
    );
  }
  const end = endIndex ?? start + LIMITS.DEFAULT_CELLS_RETURNED;
  if (!Number.isInteger(end) || end < 0) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"endIndex" must be an integer >= 0, got ${end}.`,
      { endIndex: end }
    );
  }
  if (end < start) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"endIndex" (${end}) must not be less than "startIndex" (${start}).`,
      { startIndex: start, endIndex: end }
    );
  }

  const indices: number[] = [];
  let hiddenCellCount = 0;
  const boundedEnd = Math.min(end, model.cells.length);
  for (let i = start; i < boundedEnd; i++) {
    const cell = model.cells.get(i) as unknown as IMetadataCell;
    if (cellAccess(cell) === 'none') {
      hiddenCellCount++;
      continue;
    }
    indices.push(i);
  }
  return { indices, hiddenCellCount };
}

/** Validates a batch of explicit cell ids: non-empty, and within the call cap. */
function checkCellIdBatch(cellIds: string[]): void {
  if (cellIds.length === 0) {
    throw toolError(
      'INVALID_ARGUMENT',
      '"cellIds" must not be an empty array; omit it to read a range instead.'
    );
  }
  if (cellIds.length > LIMITS.MAX_CELL_IDS_PER_CALL) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"cellIds" must not have more than ${LIMITS.MAX_CELL_IDS_PER_CALL} entries.`,
      { count: cellIds.length }
    );
  }
}

/**
 * Rejects a cell `source` write outright once it exceeds
 * `LIMITS.MAX_CELL_SOURCE_WRITE_BYTES`, rather than silently truncating real
 * notebook content the human would then see was quietly cut short.
 */
function checkSourceSize(source: string): void {
  if (source.length > LIMITS.MAX_CELL_SOURCE_WRITE_BYTES) {
    throw toolError(
      'INVALID_ARGUMENT',
      `"source" exceeds the maximum size of ${LIMITS.MAX_CELL_SOURCE_WRITE_BYTES} bytes.`,
      { length: source.length }
    );
  }
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

  const provenance = readCellMetadata(cell as unknown as IMetadataCell);
  const lastEntry = provenance.history?.[provenance.history.length - 1];
  if (lastEntry) {
    snapshot.lastEditedBy = lastEntry.actor;
    snapshot.lastEditedAt = lastEntry.at;
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
  /**
   * How many cells in the requested range the notebook owner hid from the
   * agent (`access: "none"`). Always reported, even when zero, so an agent
   * that sees a shorter list than it expected can tell the difference
   * between "that's all there is" and "some cells were withheld" instead of
   * silently reasoning over an incomplete notebook.
   */
  hiddenCellCount: number;
}> {
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const options = {
    includeSource: params.includeSource !== false,
    includeOutputs: params.includeOutputs === true
  };

  let indices: number[] = [];
  let hiddenCellCount = 0;
  if (params.cellIds) {
    checkCellIdBatch(params.cellIds);
    // Explicit ids are resolved with a `'read'` intent: a `read`-access cell
    // is returned, but a `none` cell is indistinguishable from a bad id
    // (CELL_NOT_FOUND) — see `assertCellAccessible`.
    for (let i = 0; i < params.cellIds.length; i++) {
      indices.push(requireCellIndex(panel, params.cellIds[i], 'read'));
    }
  } else {
    const range = resolveCellRange(model, params.startIndex, params.endIndex);
    indices = range.indices;
    hiddenCellCount = range.hiddenCellCount;
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
    omittedCount,
    hiddenCellCount
  };
}

/**
 * Report the agent access level (and full provenance history) of the cells
 * an agent can see, plus how many it cannot, so it can explain to the user
 * why it isn't touching something. Read-only, and never leaks a hidden
 * cell's existence: like {@link getCells}, resolving an explicit id that
 * turns out to be `'none'` fails with `CELL_NOT_FOUND`, not a report that
 * reveals it.
 */
export async function getCellAccess(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    cellIds?: string[] | null;
    startIndex?: number | null;
    endIndex?: number | null;
  } = {}
): Promise<{
  notebook: INotebookInfo;
  cells: ICellAccessSummary[];
  truncated: boolean;
  omittedCount: number;
  hiddenCellCount: number;
}> {
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;

  let indices: number[] = [];
  let hiddenCellCount = 0;
  if (params.cellIds) {
    checkCellIdBatch(params.cellIds);
    for (let i = 0; i < params.cellIds.length; i++) {
      indices.push(requireCellIndex(panel, params.cellIds[i], 'read'));
    }
  } else {
    const range = resolveCellRange(model, params.startIndex, params.endIndex);
    indices = range.indices;
    hiddenCellCount = range.hiddenCellCount;
  }

  let omittedCount = 0;
  if (indices.length > LIMITS.MAX_CELLS_RETURNED) {
    omittedCount = indices.length - LIMITS.MAX_CELLS_RETURNED;
    indices = indices.slice(0, LIMITS.MAX_CELLS_RETURNED);
  }

  const cells: ICellAccessSummary[] = indices.map(index => {
    const cell = model.cells.get(index) as unknown as IMetadataCell;
    const metadata = readCellMetadata(cell);
    return {
      cellId: cell.id,
      index,
      access: cellAccess(cell),
      history: metadata.history ?? []
    };
  });

  return {
    notebook: notebookInfo(panel),
    cells,
    truncated: omittedCount > 0,
    omittedCount,
    hiddenCellCount
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
  const panel = await resolveNotebook(env, params.notebookPath, { intent: 'write' });
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
  checkSourceSize(params.source ?? '');

  let insertIndex = model.cells.length;
  if (model.cells.length > 0) {
    const referenceIndex = params.referenceCellId
      ? requireCellIndex(panel, params.referenceCellId, 'read')
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
  recordCellHistory(
    model.cells.get(insertIndex) as unknown as IMetadataCell,
    'agent',
    'inserted',
    'jupyter_insert_cell'
  );

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
  checkSourceSize(params.source);
  if (!params.expectedSourceHash) {
    throw toolError(
      'INVALID_ARGUMENT',
      'expectedSourceHash is required so a concurrent human edit cannot be overwritten.'
    );
  }
  const panel = await resolveNotebook(env, params.notebookPath, { intent: 'write' });
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

  // Wrapped so the human-edit provenance listener (`src/access/provenance.ts`)
  // recognizes this source change as already accounted for below, instead of
  // separately recording it as a human edit.
  withAgentAttribution(() => cell.sharedModel.setSource(params.source));
  recordCellHistory(
    cell as unknown as IMetadataCell,
    'agent',
    'edited',
    'jupyter_update_cell'
  );
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
  const panel = await resolveNotebook(env, params.notebookPath, { intent: 'write' });
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
  // The post-delete active cell may be one the owner hid from the agent,
  // so its id is withheld exactly like `readFocus` withholds it.
  const activeCellVisible =
    !!activeCell &&
    cellAccess(activeCell.model as unknown as IMetadataCell) !== 'none';
  return {
    notebook: notebookInfo(panel),
    deletedCellId: params.cellId,
    activeCellId: activeCellVisible ? activeCell!.model.id : null
  };
}

/**
 * Export the notebook as a portable document, so an agent can hand it
 * onward to its own tools (upload it, email it, put it in a document)
 * without a human doing a manual export.
 *
 * Read-only. Respects per-cell agent access exactly like {@link getCells}: a
 * `"none"` cell is omitted entirely (never even its existence), and the
 * count of omitted cells is reported as `hiddenCellCount` rather than a
 * silent gap.
 */
export async function exportNotebook(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    format?: ExportFormat;
    includeOutputs?: boolean;
  } = {}
): Promise<{
  notebookPath: string;
  document: string;
  truncated: boolean;
  cellCount: number;
  hiddenCellCount: number;
}> {
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const includeOutputs = params.includeOutputs !== false;

  const visible: IExportCellInput[] = [];
  let hiddenCellCount = 0;
  const total = Math.min(model.cells.length, LIMITS.MAX_EXPORT_CELLS);
  for (let i = 0; i < total; i++) {
    const cell = model.cells.get(i) as unknown as IMetadataCell;
    if (cellAccess(cell) === 'none') {
      hiddenCellCount++;
      continue;
    }
    const cellModel = model.cells.get(i);
    let outputs: unknown[] = [];
    if (includeOutputs && cellModel.type === 'code') {
      const raw = (cellModel.sharedModel.toJSON() as { outputs?: unknown[] })
        .outputs;
      outputs = raw ?? [];
    }
    visible.push({
      id: cellModel.id,
      type: cellModel.type,
      source: cellModel.sharedModel.getSource(),
      outputs
    });
  }

  const rendered = renderNotebookMarkdown(visible, { includeOutputs });
  return {
    notebookPath: panel.context.path,
    document: rendered.document,
    truncated: rendered.truncated || model.cells.length > total,
    cellCount: rendered.cellCount,
    hiddenCellCount
  };
}

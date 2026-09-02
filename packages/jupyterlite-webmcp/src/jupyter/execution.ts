import { CodeCell, ICodeCellModel, MarkdownCell } from '@jupyterlab/cells';
import { NotebookPanel } from '@jupyterlab/notebook';

import { assertCellAccessible, cellAccess, IMetadataCell, recordCellHistory } from '../access/guard';
import { LIMITS } from '../limits';
import { toolError } from './errors';
import { INotebookInfo, kernelInfo, notebookInfo, resolveNotebook } from './notebook';
import { serializeOutputs, summarizeOutputs } from './outputs';
import { requireCellIndex } from './cells';
import { IJupyterEnv } from './workspace';

/** Outcome of executing a single cell. */
export interface ICellExecutionResult {
  /** Stable id of the executed cell. */
  cellId: string;
  /** Position of the cell at execution time. */
  index: number;
  /** `ok`, `error`, `abort` or `no-op`. */
  status: string;
  /** Execution count assigned by the kernel, when there is one. */
  executionCount?: number | null;
  /** Short bounded summary of what the cell produced. */
  outputSummary: string;
  /** Exception type when the cell raised. */
  ename?: string;
  /** Exception message when the cell raised. */
  evalue?: string;
  /** Bounded traceback when the cell raised. */
  traceback?: string;
}

/** Outcome of a `jupyter_run_cells` invocation. */
export interface IRunCellsResult {
  /** `ok`, `error` or `aborted`. */
  status: string;
  /** The notebook that was executed. */
  notebook: INotebookInfo;
  /** Per-cell results, in execution order. */
  results: ICellExecutionResult[];
}

function errorFromOutputs(
  outputs: unknown[]
): { ename?: string; evalue?: string; traceback?: string } | null {
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i] as Record<string, unknown>;
    if (output && output.output_type === 'error') {
      const serialized = serializeOutputs([output]).outputs[0];
      return {
        ename: serialized.ename,
        evalue: serialized.evalue,
        traceback: serialized.traceback
      };
    }
  }
  return null;
}

function rawOutputs(model: ICodeCellModel): unknown[] {
  const json = model.sharedModel.toJSON() as { outputs?: unknown[] };
  return json.outputs ?? [];
}

/**
 * Execute cells that already exist in the notebook.
 *
 * There is deliberately no way to execute an arbitrary source string: the
 * notebook stays the computational record, and everything the agent runs is
 * visible to the human both before and after it runs.
 */
export async function runCells(
  env: IJupyterEnv,
  params: {
    notebookPath?: string | null;
    cellIds?: string[] | null;
    /** First cell index in an optional contiguous range (inclusive). */
    startIndex?: number | null;
    /** Last cell index in an optional contiguous range (exclusive). */
    endIndex?: number | null;
    stopOnError?: boolean;
  },
  signal?: AbortSignal
): Promise<IRunCellsResult> {
  const panel = await resolveNotebook(env, params.notebookPath);
  const model = panel.context.model;
  const stopOnError = params.stopOnError !== false;

  const indices: number[] = [];
  const cellIds = params.cellIds;
  const hasCellIds = cellIds !== undefined && cellIds !== null;
  const hasStartIndex =
    params.startIndex !== undefined && params.startIndex !== null;
  const hasEndIndex = params.endIndex !== undefined && params.endIndex !== null;

  // A selector is deliberately unambiguous: callers can provide explicit
  // stable ids, one complete contiguous range, or neither (the active cell).
  // Do not silently give one selector precedence over another; a concurrent
  // edit could otherwise make a caller run a different set of cells than it
  // intended.
  if (hasCellIds && (hasStartIndex || hasEndIndex)) {
    throw toolError(
      'INVALID_ARGUMENT',
      'Provide either "cellIds" or both "startIndex" and "endIndex", not both.'
    );
  }

  if (hasStartIndex !== hasEndIndex) {
    throw toolError(
      'INVALID_ARGUMENT',
      '"startIndex" and "endIndex" must be provided together for a range.'
    );
  }

  if (hasCellIds) {
    if (cellIds.length === 0) {
      throw toolError(
        'INVALID_ARGUMENT',
        '"cellIds" must not be an empty array; omit it to run the active cell.'
      );
    }
    if (cellIds.length > LIMITS.MAX_CELL_IDS_PER_CALL) {
      throw toolError(
        'INVALID_ARGUMENT',
        `"cellIds" must not have more than ${LIMITS.MAX_CELL_IDS_PER_CALL} entries.`,
        { count: cellIds.length }
      );
    }
    for (let i = 0; i < cellIds.length; i++) {
      indices.push(requireCellIndex(panel, cellIds[i], 'write'));
    }
  } else if (hasStartIndex && hasEndIndex) {
    const start = params.startIndex as number;
    const end = params.endIndex as number;
    if (!Number.isInteger(start) || start < 0) {
      throw toolError(
        'INVALID_ARGUMENT',
        `"startIndex" must be an integer >= 0, got ${start}.`,
        { startIndex: start }
      );
    }
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
    if (end - start > LIMITS.MAX_CELL_IDS_PER_CALL) {
      throw toolError(
        'INVALID_ARGUMENT',
        `A cell range must not contain more than ${LIMITS.MAX_CELL_IDS_PER_CALL} cells.`,
        { startIndex: start, endIndex: end, count: end - start }
      );
    }

    // A range is an explicit request, so unlike a read range it does not
    // filter inaccessible cells. Preflight every target before touching the
    // kernel: a denied cell must not leave an earlier cell in the same batch
    // partially executed.
    const boundedEnd = Math.min(end, model.cells.length);
    for (let index = start; index < boundedEnd; index++) {
      const cell = model.cells.get(index) as unknown as IMetadataCell;
      assertCellAccessible(
        cell.id,
        panel.context.path,
        cellAccess(cell),
        'write'
      );
      indices.push(index);
    }
  } else {
    const active = panel.content.activeCellIndex;
    if (active < 0 || active >= model.cells.length) {
      throw toolError(
        'INVALID_ARGUMENT',
        'No cell selector was given and there is no active cell to run.'
      );
    }
    // The active cell is not addressed by id, but running it is exactly as
    // restricted as running any other cell by id: run the same centralized
    // check `requireCellIndex` applies.
    const activeCell = model.cells.get(active) as unknown as IMetadataCell;
    assertCellAccessible(
      activeCell.id,
      panel.context.path,
      cellAccess(activeCell),
      'write'
    );
    indices.push(active);
  }

  await panel.sessionContext.ready;
  const hasCodeCell = indices.some(
    index => model.cells.get(index).type === 'code'
  );
  if (hasCodeCell && !panel.sessionContext.session?.kernel) {
    throw toolError(
      'KERNEL_UNAVAILABLE',
      `No kernel is attached to "${panel.context.path}".`,
      { notebookPath: panel.context.path }
    );
  }

  // Only interrupt work this invocation actually started: a shared kernel may
  // be busy with something the human launched.
  let inFlight = false;
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    if (inFlight) {
      const kernel = panel.sessionContext.session?.kernel;
      if (kernel) {
        void kernel.interrupt().catch(() => undefined);
      }
    }
  };
  if (signal) {
    if (signal.aborted) {
      throw toolError('ABORTED', 'The tool invocation was aborted.');
    }
    signal.addEventListener('abort', onAbort);
  }

  const results: ICellExecutionResult[] = [];
  let overall = 'ok';

  try {
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      const cellModel = model.cells.get(index);
      if (aborted) {
        results.push({
          cellId: cellModel.id,
          index,
          status: 'abort',
          outputSummary: '(not run: aborted)'
        });
        overall = 'aborted';
        continue;
      }

      const widget = panel.content.widgets[index];
      if (!widget) {
        throw toolError(
          'CELL_NOT_FOUND',
          `Cell "${cellModel.id}" has no widget in the notebook.`,
          { cellId: cellModel.id }
        );
      }

      if (widget instanceof MarkdownCell) {
        widget.rendered = true;
        results.push({
          cellId: cellModel.id,
          index,
          status: 'no-op',
          outputSummary: '(markdown cell rendered)'
        });
        continue;
      }

      if (!(widget instanceof CodeCell)) {
        results.push({
          cellId: cellModel.id,
          index,
          status: 'no-op',
          outputSummary: `(${cellModel.type} cells are not executed)`
        });
        continue;
      }

      const codeModel = widget.model as ICodeCellModel;
      if (!codeModel.sharedModel.getSource().trim()) {
        results.push({
          cellId: cellModel.id,
          index,
          status: 'no-op',
          executionCount: codeModel.executionCount ?? null,
          outputSummary: '(empty cell)'
        });
        continue;
      }

      inFlight = true;
      let status = 'ok';
      let failure: {
        ename?: string;
        evalue?: string;
        traceback?: string;
      } | null = null;
      try {
        const reply = await CodeCell.execute(widget, panel.sessionContext, {
          deletedCells: model.deletedCells,
          recordTiming: true
        });
        const content = reply?.content as
          | { status?: string; ename?: string; evalue?: string; traceback?: string[] }
          | undefined;
        if (content?.status === 'error') {
          status = 'error';
          failure = {
            ename: content.ename,
            evalue: content.evalue,
            traceback: (content.traceback ?? []).join('\n')
          };
        } else if (content?.status === 'abort') {
          status = 'abort';
        }
      } catch (error) {
        status = 'error';
        failure = {
          ename: 'ExecutionError',
          evalue: error instanceof Error ? error.message : String(error)
        };
      } finally {
        inFlight = false;
      }

      const outputs = rawOutputs(codeModel);
      if (status === 'ok') {
        const outputError = errorFromOutputs(outputs);
        if (outputError) {
          status = 'error';
          failure = outputError;
        }
      }
      if (status !== 'ok' && failure) {
        const serialized = serializeOutputs([
          {
            output_type: 'error',
            ename: failure.ename ?? '',
            evalue: failure.evalue ?? '',
            traceback: (failure.traceback ?? '').split('\n')
          }
        ]).outputs[0];
        failure = {
          ename: serialized.ename,
          evalue: serialized.evalue,
          traceback: serialized.traceback
        };
      }

      const result: ICellExecutionResult = {
        cellId: cellModel.id,
        index,
        status,
        executionCount: codeModel.executionCount ?? null,
        outputSummary: summarizeOutputs(outputs)
      };
      if (failure) {
        result.ename = failure.ename;
        result.evalue = failure.evalue;
        result.traceback = failure.traceback;
      }
      results.push(result);
      if (status !== 'abort') {
        recordCellHistory(
          codeModel as unknown as IMetadataCell,
          'agent',
          'ran',
          'jupyter_run_cells'
        );
      }

      if (status === 'error') {
        overall = 'error';
        if (stopOnError) {
          break;
        }
      } else if (status === 'abort') {
        overall = 'aborted';
        if (stopOnError) {
          break;
        }
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }

  if (aborted && overall === 'ok') {
    overall = 'aborted';
  }
  return { status: overall, notebook: notebookInfo(panel), results };
}

/** Interrupt or restart the kernel behind a notebook. */
export async function kernelAction(
  env: IJupyterEnv,
  params: { notebookPath?: string | null; action: string }
): Promise<{
  action: string;
  notebookPath: string;
  kernel: ReturnType<typeof kernelInfo>;
  message: string;
}> {
  const panel: NotebookPanel = await resolveNotebook(env, params.notebookPath);
  await panel.sessionContext.ready;
  const kernel = panel.sessionContext.session?.kernel;

  if (params.action === 'interrupt') {
    if (!kernel) {
      throw toolError(
        'KERNEL_UNAVAILABLE',
        `No kernel is attached to "${panel.context.path}".`
      );
    }
    await kernel.interrupt();
    return {
      action: 'interrupt',
      notebookPath: panel.context.path,
      kernel: kernelInfo(panel),
      message:
        'Sent an interrupt to the kernel. Any cell that was running has been asked to stop.'
    };
  }

  if (params.action === 'restart') {
    await panel.sessionContext.restartKernel();
    return {
      action: 'restart',
      notebookPath: panel.context.path,
      kernel: kernelInfo(panel),
      message:
        'The kernel was restarted. Every in-memory variable is gone; cells must be re-run to rebuild state.'
    };
  }

  throw toolError(
    'INVALID_ARGUMENT',
    `Unsupported kernel action "${params.action}". Expected interrupt or restart.`,
    { action: params.action }
  );
}

/**
 * Pure rendering for `jupyter_export_notebook`: turns a plain list of cells
 * (already resolved and access-filtered by the caller) into a single bounded
 * markdown document. Kept free of any `@jupyterlab/*` dependency, like
 * `src/jupyter/outputs.ts`, so it is unit-testable without a JupyterLab
 * runtime.
 */
import { LIMITS } from '../limits';
import { boundText, serializeOutput } from './outputs';

/** Export formats `jupyter_export_notebook` accepts. Only one exists today. */
export type ExportFormat = 'markdown';

/** Every export format this tool currently supports. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ['markdown'];

/** One cell's worth of plain data needed to render it, already access-filtered. */
export interface IExportCellInput {
  /** Stable nbformat cell id. */
  id: string;
  /** `code`, `markdown` or `raw`. */
  type: string;
  /** Live cell source. */
  source: string;
  /** Raw nbformat outputs (code cells only). Ignored for other cell types. */
  outputs: unknown[];
}

/** The bounded result of rendering a notebook to a portable document. */
export interface IRenderedExport {
  /** The rendered document, bounded to `LIMITS.MAX_EXPORT_BYTES`. */
  document: string;
  /** Whether the document was cut short to fit the size bound. */
  truncated: boolean;
  /** How many cells were actually rendered. */
  cellCount: number;
}

/**
 * Wraps `body` in a backtick code fence (CommonMark) that is longer than any
 * run of backticks inside it, so content containing ``` can never close the
 * block early and break the document's structure.
 */
export function fence(body: string, info = ''): string {
  let longest = 0;
  const runs = body.match(/`+/g);
  if (runs) {
    for (const run of runs) {
      longest = Math.max(longest, run.length);
    }
  }
  const marker = '`'.repeat(Math.max(3, longest + 1));
  return marker + info + '\n' + body + '\n' + marker;
}

function renderOutput(raw: unknown): string | null {
  const serialized = serializeOutput(raw);
  if (serialized.outputType === 'error') {
    const header = `${serialized.ename ?? ''}: ${serialized.evalue ?? ''}`.trim();
    const body = [header, serialized.traceback ?? ''].filter(Boolean).join('\n');
    return fence(body);
  }
  if (serialized.text && serialized.text.trim()) {
    return fence(serialized.text);
  }
  if (serialized.html && serialized.html.trim()) {
    return fence(serialized.html);
  }
  const textData = serialized.textData?.find(entry => entry.text.trim());
  if (textData) {
    return fence(textData.text);
  }
  if (serialized.media && serialized.media.length > 0) {
    return serialized.media
      .map(media => `![output](${media.mimeType}, ${media.bytes} bytes — not included)`)
      .join('\n\n');
  }
  return null;
}

function renderCell(cell: IExportCellInput, includeOutputs: boolean): string {
  if (cell.type === 'markdown') {
    return cell.source;
  }
  const language = cell.type === 'code' ? 'python' : 'text';
  const parts = [fence(cell.source, language)];
  if (includeOutputs && cell.type === 'code' && cell.outputs.length > 0) {
    for (const raw of cell.outputs) {
      const rendered = renderOutput(raw);
      if (rendered) {
        parts.push(rendered);
      }
    }
  }
  return parts.join('\n\n');
}

/**
 * Renders a list of already-visible (access-filtered) cells into a single
 * bounded markdown document: markdown cells verbatim, code cells as fenced
 * ```python blocks, and (when `includeOutputs`) their text/error outputs as
 * fenced blocks, with images/binary media represented only by a placeholder
 * line — never embedded as base64.
 */
export function renderNotebookMarkdown(
  cells: IExportCellInput[],
  options: { includeOutputs: boolean }
): IRenderedExport {
  const bounded = cells.slice(0, LIMITS.MAX_EXPORT_CELLS);
  const rendered = bounded.map(cell => renderCell(cell, options.includeOutputs));
  const joined = rendered.join('\n\n---\n\n');
  const bound = boundText(joined, LIMITS.MAX_EXPORT_BYTES);
  return {
    document: bound.text,
    truncated: bound.truncated || bounded.length < cells.length,
    cellCount: bounded.length
  };
}

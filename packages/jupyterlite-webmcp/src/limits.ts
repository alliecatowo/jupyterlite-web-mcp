/**
 * Centralized bounds used to keep every tool result small, predictable, and
 * safe to hand back to an LLM agent. Every module that serializes notebook
 * data, kernel output, or review comments into a tool result should read its
 * size limits from here rather than hard-coding a number, so the bounds stay
 * consistent and easy to tune in one place.
 */
export const LIMITS = {
  DEFAULT_CELLS_RETURNED: 20,
  MAX_CELLS_RETURNED: 100,
  MAX_WORKSPACE_ROWS: 100,
  MAX_CELL_SOURCE_BYTES: 25 * 1024,
  MAX_TEXT_OUTPUT_BYTES: 10 * 1024,
  MAX_TOTAL_RESULT_BYTES: 50 * 1024,
  MAX_SELECTED_TEXT_BYTES: 4 * 1024,
  MAX_COMMENT_BODY_BYTES: 8 * 1024,
  MAX_COMMENTS_RETURNED: 50,
  MAX_OUTPUTS_PER_CELL: 10,
  MAX_ANCHOR_CONTEXT: 80,
  MAX_PREVIEW_CHARS: 400,
  MAX_SUMMARY_CHARS: 600,
  MAX_CELL_HISTORY_ENTRIES: 20,
  HISTORY_COALESCE_WINDOW_MS: 60 * 1000,
  /**
   * Maximum accepted size of a cell `source` written by
   * `jupyter_insert_cell`/`jupyter_update_cell`. Deliberately larger than
   * `MAX_CELL_SOURCE_BYTES` (which bounds what a *read* returns): a write
   * input is real notebook content the human will see and keep, not a
   * summary handed to an agent, so it is rejected outright rather than
   * silently truncated.
   */
  MAX_CELL_SOURCE_WRITE_BYTES: 256 * 1024,
  /** Maximum accepted byte length of a notebook/file `name`. */
  MAX_NAME_BYTES: 256,
  /** Maximum number of cell ids accepted in one id-array argument. */
  MAX_CELL_IDS_PER_CALL: 100,
  /** Maximum rendered size of a `jupyter_export_notebook` document. */
  MAX_EXPORT_BYTES: 40 * 1024,
  /** Maximum number of cells `jupyter_export_notebook` will walk. */
  MAX_EXPORT_CELLS: 500
};

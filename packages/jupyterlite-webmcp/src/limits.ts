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
  MAX_SUMMARY_CHARS: 600
};

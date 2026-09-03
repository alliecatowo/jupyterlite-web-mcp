import { cellAccess, IMetadataCell } from '../access/guard';
import { notebookAccessOfPanel } from '../access/notebook';
import { findCellIndexById } from '../jupyter/cells';
import { IJupyterEnv } from '../jupyter/workspace';
import { IOutputSelection } from './capture';

/**
 * The output-selection tracker's record, filtered through agent access
 * control before it reaches the agent.
 *
 * The tracker records whatever the human selects, but a selection inside a
 * cell (or a notebook) the owner hid from the agent must read as "no
 * selection" rather than leaking the hidden cell's id, selected text, or
 * output fingerprint. A selection the tracker cannot attribute to a visible
 * cell of the current notebook (a stale record from a notebook that is no
 * longer current, or a hidden notebook that reads as "none open") is also
 * `null`: failing safe never leaks, it only withholds. Selections in
 * read-only cells stay visible — reads are permitted there.
 */
export function visibleOutputSelection(
  env: IJupyterEnv,
  record: IOutputSelection | null
): IOutputSelection | null {
  if (!record) {
    return null;
  }
  const panel = env.tracker.currentWidget;
  if (!panel || notebookAccessOfPanel(panel) === 'none') {
    return null;
  }
  const index = findCellIndexById(panel.context.model, record.cellId);
  if (index === -1) {
    return null;
  }
  const cell = panel.context.model.cells.get(index) as unknown as IMetadataCell;
  if (cellAccess(cell) === 'none') {
    return null;
  }
  return record;
}

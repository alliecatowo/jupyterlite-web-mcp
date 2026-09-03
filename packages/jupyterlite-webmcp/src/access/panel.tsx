/**
 * The Agent panel's Access section: a complete place to see and change
 * every cell's agent-access level, so the per-cell toolbar/context-menu
 * control (`src/access/commands.ts`) is a shortcut to this, not the only
 * way to configure permissions. Every write still goes through
 * `src/access/guard.ts`'s `setCellAccess` - the same choke point the
 * shortcut uses - so enforcement is untouched.
 */
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import * as React from 'react';

import { revealCell } from '../jupyter/focus';
import { IMetadataCell, setCellAccess } from './guard';
import { accessLabel, accessShortLabel, nextAccess } from './model';
import { AccessOverview, IAccessRow } from './overview';

/** Options accepted by {@link AccessSection}. */
export interface IAccessSectionProps {
  /** Tracks the current notebook. */
  tracker: INotebookTracker;
  /** Computes the per-cell rows for the current notebook. */
  overview: AccessOverview;
}

function renderRow(panel: NotebookPanel, row: IAccessRow): JSX.Element {
  const jump = (): void => {
    void revealCell(panel, row.index).catch(() => undefined);
  };
  const cycle = (event: React.MouseEvent): void => {
    event.stopPropagation();
    try {
      const cell = panel.context.model.cells.get(row.index) as unknown as IMetadataCell;
      setCellAccess(cell, nextAccess(row.access));
    } catch (err) {
      console.warn('[jupyterlite-webmcp]', err);
    }
  };
  return (
    <div
      key={row.cellId}
      className={
        'jp-webmcp-accessRow' + (row.access === 'write' ? '' : ` jp-webmcp-accessRow-${row.access}`)
      }
      role="button"
      tabIndex={0}
      onClick={jump}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          jump();
        }
      }}
      title={accessLabel(row.access)}
    >
      <span className="jp-webmcp-accessIndex">{row.index + 1}</span>
      <span className="jp-webmcp-accessLabel">{row.label}</span>
      {row.lastHistory ? (
        <span className="jp-webmcp-accessHistory">
          {(row.lastHistory.actor === 'agent' ? 'Agent' : 'You') +
            ' · ' +
            new Date(row.lastHistory.at).toLocaleDateString()}
        </span>
      ) : null}
      <button className="jp-webmcp-btn jp-webmcp-accessToggle" onClick={cycle}>
        {accessShortLabel(row.access)}
      </button>
    </div>
  );
}

/**
 * Renders the Access section body: every cell of the current notebook with
 * its effective access level, clickable to jump to the cell, plus a control
 * that cycles it (write -> read -> none -> write), or an empty-state
 * message when there is no notebook open or it has no cells.
 */
export function AccessSection(props: IAccessSectionProps): JSX.Element {
  const panel = props.tracker.currentWidget;
  if (!panel) {
    return <div className="jp-webmcp-empty">No notebook open.</div>;
  }
  const rows = props.overview.rows(panel);
  if (rows.length === 0) {
    return <div className="jp-webmcp-empty">This notebook has no cells.</div>;
  }
  return <div className="jp-webmcp-accessList">{rows.map(row => renderRow(panel, row))}</div>;
}

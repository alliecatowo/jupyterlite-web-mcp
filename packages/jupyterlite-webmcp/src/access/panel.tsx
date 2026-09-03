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
import {
  notebookAccessLabel,
  notebookAccessOfPanel,
  notebookAccessShortLabel,
  NotebookAccess,
  setNotebookAccess
} from './notebook';
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
 * Renders the Access section body: the current notebook's own agent-access
 * level (plus a bulk control applying it to every cell), then every cell of
 * the notebook with its effective access level, clickable to jump to the
 * cell, plus a control that cycles it (write -> read -> none -> write).
 * Every write still goes through the `src/access/*` choke points
 * (`setNotebookAccess`/`setCellAccess`) — the same ones the context-menu
 * shortcuts use — so enforcement is untouched.
 */
export function AccessSection(props: IAccessSectionProps): JSX.Element {
  const bump = React.useReducer((version: number) => version + 1, 0)[1];
  const panel = props.tracker.currentWidget;
  if (!panel) {
    return <div className="jp-webmcp-empty">No notebook open.</div>;
  }
  const access = notebookAccessOfPanel(panel);
  const name = panel.context.path.split('/').pop() || panel.context.path;
  const rows = props.overview.rows(panel);

  const setNotebook = (next: NotebookAccess): void => {
    try {
      setNotebookAccess(panel, next);
    } catch (err) {
      console.warn('[jupyterlite-webmcp]', err);
    }
    bump();
  };
  const applyToAllCells = (): void => {
    try {
      const model = panel.context.model;
      for (let i = 0; i < model.cells.length; i++) {
        setCellAccess(model.cells.get(i) as unknown as IMetadataCell, access);
      }
    } catch (err) {
      console.warn('[jupyterlite-webmcp]', err);
    }
    bump();
  };

  return (
    <div>
      <div className="jp-webmcp-notebookAccess">
        <div className="jp-webmcp-notebookAccess-row" title={notebookAccessLabel(access)}>
          <span className="jp-webmcp-notebookAccess-name">{name}</span>
          <select
            className="jp-webmcp-notebookAccess-select"
            aria-label="Agent access for this notebook"
            value={access}
            onChange={event => setNotebook(event.target.value as NotebookAccess)}
          >
            {(['write', 'read', 'none'] as NotebookAccess[]).map(level => (
              <option key={level} value={level}>
                {notebookAccessShortLabel(level)}
              </option>
            ))}
          </select>
        </div>
        {rows.length > 0 ? (
          <button
            className="jp-webmcp-btn jp-webmcp-notebookAccess-apply"
            title={`Set every cell in this notebook to ${notebookAccessShortLabel(access)} for the agent.`}
            onClick={applyToAllCells}
          >
            {`Apply to all ${rows.length} cell${rows.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="jp-webmcp-empty">This notebook has no cells.</div>
      ) : (
        <div className="jp-webmcp-accessList">{rows.map(row => renderRow(panel, row))}</div>
      )}
    </div>
  );
}

/**
 * The command a human uses to control what a connected agent may do with a
 * cell. Deliberately the only way a cell's access ever changes — no WebMCP
 * tool can set it (see `src/access/guard.ts`'s `setCellAccess`) — and
 * registered as an ordinary JupyterLab command plus a cell context-menu
 * entry, so it is reachable from the command palette and keyboard with no
 * agent connected at all.
 *
 * A dedicated cell-toolbar button was the first choice, but contributing
 * one requires this extension to ship its own `jupyter.lab.toolbars.Cell`
 * settings-schema entry (the mechanism `@jupyterlab/celltoolbar-extension`
 * reconciles across every plugin that wants a Cell-toolbar item), which
 * means adding a schema directory wired up in `package.json` — off limits
 * for this change. The context-menu command is the documented fallback.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';

import { cellAccess, IMetadataCell, setCellAccess } from './guard';
import { accessLabel, accessShortLabel, nextAccess } from './model';

/** Command ids contributed by this module. */
export namespace AccessCommandIDs {
  /** Cycle the active cell's agent access: write -> read -> none -> write. */
  export const cycleCellAccess = 'jupyterlite-webmcp:cycle-cell-access';
}

/** Options accepted by {@link registerAccessCommands}. */
export interface IAccessCommandOptions {
  /** The application, used to register the command and context menu item. */
  app: JupyterFrontEnd;
  /** Tracks the current notebook and its active cell. */
  tracker: INotebookTracker;
}

/**
 * Registers `jupyterlite-webmcp:cycle-cell-access` and its cell
 * context-menu entry.
 */
export function registerAccessCommands(options: IAccessCommandOptions): void {
  const { app, tracker } = options;

  function activeCell(): IMetadataCell | null {
    const cell = tracker.currentWidget?.content.activeCell;
    return cell ? (cell.model as unknown as IMetadataCell) : null;
  }

  app.commands.addCommand(AccessCommandIDs.cycleCellAccess, {
    label: () => {
      const cell = activeCell();
      const access = cell ? cellAccess(cell) : 'write';
      return `Agent Access: ${accessShortLabel(access)}`;
    },
    caption: () => {
      const cell = activeCell();
      const access = cell ? cellAccess(cell) : 'write';
      return `${accessLabel(access)}. Select to change what a connected agent may do with this cell.`;
    },
    isEnabled: () => !!activeCell(),
    execute: () => {
      try {
        const cell = activeCell();
        if (!cell) {
          return;
        }
        setCellAccess(cell, nextAccess(cellAccess(cell)));
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    }
  });

  app.contextMenu.addItem({
    command: AccessCommandIDs.cycleCellAccess,
    selector: '.jp-Notebook .jp-Cell',
    rank: 14
  });
}

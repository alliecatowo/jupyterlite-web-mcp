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
 *
 * Notebook-level access (`src/access/notebook.ts`) follows the same
 * owner-side lockdown principle one level up: `cycle-notebook-access` below
 * is likewise human-only, with no WebMCP tool able to read or change it.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import { cellAccess, IMetadataCell, setCellAccess } from './guard';
import { accessLabel, accessShortLabel, nextAccess } from './model';
import {
  notebookAccessOfContent,
  notebookAccessOfPanel,
  nextNotebookAccess,
  NotebookAccess,
  setNotebookAccess,
  writeNotebookAccessToFile
} from './notebook';

/** Command ids contributed by this module. */
export namespace AccessCommandIDs {
  /** Cycle the active cell's agent access: write -> read -> none -> write. */
  export const cycleCellAccess = 'jupyterlite-webmcp:cycle-cell-access';
  /** Cycle a notebook's agent access: write -> read -> none -> write. */
  export const cycleNotebookAccess = 'jupyterlite-webmcp:cycle-notebook-access';
}

/** Options accepted by {@link registerAccessCommands}. */
export interface IAccessCommandOptions {
  /** The application, used to register the command and context menu item. */
  app: JupyterFrontEnd;
  /** Tracks the current notebook and its active cell. */
  tracker: INotebookTracker;
  /** The default file browser, used to resolve the notebook context-menu target. */
  fileBrowser?: IDefaultFileBrowser | null;
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

  registerNotebookAccessCommand(options);
}

/**
 * Registers `jupyterlite-webmcp:cycle-notebook-access` and its file-browser
 * context-menu entry on notebooks.
 *
 * The target is the file browser's selected notebook when exactly one
 * notebook is selected (the context-menu case), falling back to the current
 * open notebook (the palette/keyboard case). An open notebook is written
 * through its live model so the change applies to the agent immediately,
 * unsaved; a notebook that is not open is written straight to its file.
 * Either way no WebMCP tool is involved — this command is the human owner's
 * lockdown control, mirroring the per-cell one above.
 */
function registerNotebookAccessCommand(options: IAccessCommandOptions): void {
  const { app, tracker, fileBrowser } = options;

  function selectedNotebookPath(): string | null {
    try {
      const items = fileBrowser ? Array.from(fileBrowser.selectedItems()) : [];
      const notebooks = items.filter(
        item => item.type === 'notebook' || item.path.endsWith('.ipynb')
      );
      if (notebooks.length === 1) {
        return notebooks[0].path;
      }
    } catch {
      // A file browser that cannot report a selection simply yields no target.
    }
    return null;
  }

  function targetPath(): string | null {
    return selectedNotebookPath() ?? tracker.currentWidget?.context.path ?? null;
  }

  function openPanelFor(path: string): NotebookPanel | null {
    const current = tracker.currentWidget;
    if (current && current.context.path === path) {
      return current;
    }
    return null;
  }

  async function currentAccess(path: string): Promise<NotebookAccess> {
    const panel = openPanelFor(path);
    if (panel) {
      return notebookAccessOfPanel(panel);
    }
    try {
      const model = await app.serviceManager.contents.get(path, {
        content: true
      });
      if (model.type !== 'notebook') {
        return 'write';
      }
      return notebookAccessOfContent(model.content);
    } catch {
      return 'write';
    }
  }

  app.commands.addCommand(AccessCommandIDs.cycleNotebookAccess, {
    label: 'Agent Access: Notebook…',
    caption:
      'Change what a connected agent may do with this notebook (editable, read-only, or hidden).',
    isEnabled: () => !!targetPath(),
    execute: async () => {
      try {
        const path = targetPath();
        if (!path) {
          return;
        }
        const next = nextNotebookAccess(await currentAccess(path));
        const panel = openPanelFor(path);
        if (panel) {
          setNotebookAccess(panel, next);
        } else {
          await writeNotebookAccessToFile(
            app.serviceManager.contents,
            path,
            next
          );
        }
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    }
  });

  app.contextMenu.addItem({
    command: AccessCommandIDs.cycleNotebookAccess,
    selector: '.jp-DirListing-item[data-file-type="notebook"]',
    rank: 14
  });
}

import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Contents } from '@jupyterlab/services';

import { LIMITS } from '../limits';
import { toolError } from './errors';
import { validatePath } from './paths';

/**
 * Everything the semantic Jupyter operations need from the running
 * application. Passing this explicitly keeps the operations testable and keeps
 * the WebMCP layer free of JupyterLab imports.
 */
export interface IJupyterEnv {
  /** The running JupyterLab/JupyterLite application. */
  app: JupyterFrontEnd;
  /** Document manager, used to open and reveal documents. */
  docManager: IDocumentManager;
  /** Notebook tracker: the authority on the current notebook. */
  tracker: INotebookTracker;
  /** The default file browser, used only to report the current directory. */
  fileBrowser: IDefaultFileBrowser | null;
}

/** A single row of a workspace listing. */
export interface IWorkspaceEntry {
  /** Workspace-relative path. */
  path: string;
  /** File or directory name. */
  name: string;
  /** `directory`, `notebook` or `file`. */
  type: string;
  /** Size in bytes when the contents manager reports one. */
  size?: number;
  /** Last modified timestamp when the contents manager reports one. */
  modified?: string;
}

/** Result of {@link listWorkspace}. */
export interface IWorkspaceListing {
  /** The directory that was listed. */
  path: string;
  /** The entries, never longer than the requested limit. */
  entries: IWorkspaceEntry[];
  /** Whether entries were omitted because the limit was reached. */
  truncated: boolean;
  /** How many entries were omitted. */
  omittedCount: number;
}

/** Return the contents manager for the running application. */
export function contentsManager(env: IJupyterEnv): Contents.IManager {
  return env.docManager.services.contents;
}

/** The directory currently shown in the file browser, or the workspace root. */
export function currentDirectory(env: IJupyterEnv): string {
  const path = env.fileBrowser?.model?.path;
  return typeof path === 'string' ? path : '';
}

/** Paths of the documents currently open in the main work area. */
export function openDocuments(env: IJupyterEnv): string[] {
  const paths: string[] = [];
  const widgets = env.app.shell.widgets('main');
  let next = widgets.next();
  while (!next.done) {
    const context = (next.value as { context?: { path?: string } }).context;
    if (context && typeof context.path === 'string') {
      paths.push(context.path);
    }
    next = widgets.next();
  }
  return paths;
}

function toEntry(model: Contents.IModel): IWorkspaceEntry {
  const entry: IWorkspaceEntry = {
    path: model.path,
    name: model.name,
    type: model.type
  };
  if (typeof model.size === 'number') {
    entry.size = model.size;
  }
  if (model.last_modified) {
    entry.modified = model.last_modified;
  }
  return entry;
}

/**
 * List files and directories in the browser-local workspace.
 *
 * Never returns file contents: this is a navigation aid, not a bulk export.
 */
export async function listWorkspace(
  env: IJupyterEnv,
  params: {
    path?: string | null;
    recursive?: boolean;
    limit?: number;
  } = {}
): Promise<IWorkspaceListing> {
  const root = validatePath(params.path);
  const limit = Math.max(
    1,
    Math.min(
      params.limit ?? LIMITS.MAX_WORKSPACE_ROWS,
      LIMITS.MAX_WORKSPACE_ROWS
    )
  );
  const contents = contentsManager(env);

  const entries: IWorkspaceEntry[] = [];
  let omittedCount = 0;
  const queue: string[] = [root];

  while (queue.length > 0) {
    const directory = queue.shift() as string;
    let listing: Contents.IModel;
    try {
      listing = await contents.get(directory, { content: true });
    } catch (error) {
      if (directory === root) {
        throw toolError(
          'NOTEBOOK_NOT_FOUND',
          `No directory at path "${directory}".`,
          { path: directory }
        );
      }
      continue;
    }
    if (listing.type !== 'directory') {
      throw toolError(
        'INVALID_PATH',
        `"${directory}" is a file, not a directory.`,
        { path: directory }
      );
    }
    const children = (listing.content as Contents.IModel[]) ?? [];
    const sorted = children.slice().sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') {
        return -1;
      }
      if (b.type === 'directory' && a.type !== 'directory') {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (let i = 0; i < sorted.length; i++) {
      const child = sorted[i];
      if (entries.length >= limit) {
        omittedCount += 1;
        continue;
      }
      entries.push(toEntry(child));
      if (params.recursive && child.type === 'directory') {
        queue.push(child.path);
      }
    }
  }

  return {
    path: root,
    entries,
    truncated: omittedCount > 0,
    omittedCount
  };
}

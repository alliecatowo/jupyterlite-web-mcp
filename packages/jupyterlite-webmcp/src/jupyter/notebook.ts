import { INotebookModel, NotebookPanel } from '@jupyterlab/notebook';

import { toolError } from './errors';
import { basename, joinPath, validatePath } from './paths';
import { computeNotebookRevision, ICellHashInput } from './revisions';
import { contentsManager, IJupyterEnv } from './workspace';

/** Bounded description of the notebook a tool acted on. */
export interface INotebookInfo {
  /** Workspace-relative path. */
  path: string;
  /** File name. */
  name: string;
  /** Whether the live model has unsaved changes. */
  dirty: boolean;
  /** Deterministic revision of the live cell structure and sources. */
  revision: string;
  /** Number of cells in the live model. */
  cellCount: number;
}

/** Description of the kernel backing a notebook. */
export interface IKernelInfo {
  /** Kernel name, or `null` when no kernel is attached. */
  name: string | null;
  /** Kernel display name when known. */
  displayName?: string;
  /** `idle`, `busy`, `starting`, `dead`, or `unknown`. */
  status: string;
}

/** Options controlling how a notebook is resolved. */
export interface IResolveOptions {
  /** Bring the notebook to the front of the shell. Defaults to `false`. */
  activate?: boolean;
  /** Open the notebook if it is not already open. Defaults to `true`. */
  open?: boolean;
}

/**
 * Wait until the service manager, and in particular the kernel spec registry,
 * is ready.
 *
 * In JupyterLite the kernels are registered by frontend extensions during
 * start-up, so a tool invoked very early would otherwise see no kernels at all.
 */
async function serviceManagerReady(env: IJupyterEnv): Promise<void> {
  try {
    await env.app.serviceManager.ready;
    await env.app.serviceManager.kernelspecs.ready;
  } catch (error) {
    // A service that never becomes ready must not block a notebook from
    // opening; the notebook simply opens without a kernel.
  }
}

/**
 * Resolve a notebook panel from an optional path.
 *
 * With no path this returns the notebook the human is currently working in.
 * With a path it reuses an already-open panel when there is one, so tools
 * always read the live model including unsaved edits, never the bytes on disk.
 */
export async function resolveNotebook(
  env: IJupyterEnv,
  path?: string | null,
  options: IResolveOptions = {}
): Promise<NotebookPanel> {
  const activate = options.activate ?? false;
  const open = options.open ?? true;

  if (path === null || path === undefined || path === '') {
    const panel = env.tracker.currentWidget;
    if (!panel) {
      throw toolError(
        'NO_ACTIVE_NOTEBOOK',
        'There is no notebook open. Open one first, or pass notebookPath.'
      );
    }
    await panel.context.ready;
    if (activate) {
      env.app.shell.activateById(panel.id);
    }
    return panel;
  }

  const normalized = validatePath(path);
  let widget = env.docManager.findWidget(normalized);

  // Opening a notebook before JupyterLite has registered its kernel specs
  // leaves the panel with no kernel and pops a "Select Kernel" dialog at the
  // user. Waiting for the service manager lets the notebook start its own
  // preferred kernel, exactly as it would if the user had opened it.
  if (!widget) {
    await serviceManagerReady(env);
  }

  if (!widget) {
    if (!open) {
      throw toolError(
        'NOTEBOOK_NOT_FOUND',
        `The notebook "${normalized}" is not open.`,
        { path: normalized }
      );
    }
    try {
      await contentsManager(env).get(normalized, { content: false });
    } catch (error) {
      throw toolError(
        'NOTEBOOK_NOT_FOUND',
        `No file exists at "${normalized}".`,
        { path: normalized }
      );
    }
    widget = env.docManager.openOrReveal(normalized, 'default', undefined, {
      activate
    });
  } else if (activate) {
    env.app.shell.activateById(widget.id);
  }

  if (!(widget instanceof NotebookPanel)) {
    throw toolError(
      'NOTEBOOK_NOT_FOUND',
      `"${normalized}" is not a notebook.`,
      { path: normalized }
    );
  }
  await widget.context.ready;
  return widget;
}

/** Collect the hash inputs of every cell in the live model. */
export function cellHashInputs(model: INotebookModel): ICellHashInput[] {
  const inputs: ICellHashInput[] = [];
  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);
    inputs.push({
      id: cell.id,
      cellType: cell.type,
      source: cell.sharedModel.getSource()
    });
  }
  return inputs;
}

/** Summarize the live notebook model. */
export function notebookInfo(panel: NotebookPanel): INotebookInfo {
  const model = panel.context.model;
  return {
    path: panel.context.path,
    name: basename(panel.context.path),
    dirty: model.dirty,
    revision: computeNotebookRevision(cellHashInputs(model)),
    cellCount: model.cells.length
  };
}

/** Summarize the kernel attached to a notebook. */
export function kernelInfo(panel: NotebookPanel): IKernelInfo {
  const session = panel.sessionContext.session;
  const kernel = session?.kernel;
  if (!kernel) {
    return { name: null, status: 'unavailable' };
  }
  return {
    name: kernel.name,
    displayName: panel.sessionContext.kernelDisplayName,
    status: kernel.status ?? 'unknown'
  };
}

/**
 * Create a new notebook in the browser-local workspace and open it.
 *
 * Refuses to overwrite an existing file.
 */
export async function createNotebook(
  env: IJupyterEnv,
  params: { name: string; directory?: string | null; kernel?: string | null }
): Promise<{ path: string; panel: NotebookPanel }> {
  const rawName = params.name;
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    throw toolError('INVALID_ARGUMENT', 'A notebook name is required.');
  }
  const fileName = /\.ipynb$/i.test(rawName.trim())
    ? rawName.trim()
    : `${rawName.trim()}.ipynb`;
  const directory = validatePath(params.directory);
  const target = joinPath(directory, fileName);

  const contents = contentsManager(env);
  let exists = true;
  try {
    await contents.get(target, { content: false });
  } catch (error) {
    exists = false;
  }
  if (exists) {
    throw toolError(
      'PATH_EXISTS',
      `A file already exists at "${target}". Nothing was overwritten.`,
      { path: target }
    );
  }

  await serviceManagerReady(env);
  const created = await contents.newUntitled({
    type: 'notebook',
    path: directory
  });
  await contents.rename(created.path, target);

  const kernelName = await resolveKernelName(env, params.kernel);
  const widget = env.docManager.openOrReveal(
    target,
    'default',
    kernelName ? { name: kernelName } : undefined,
    { activate: true }
  );
  if (!(widget instanceof NotebookPanel)) {
    throw toolError(
      'INTERNAL_ERROR',
      `Created "${target}" but could not open it as a notebook.`,
      { path: target }
    );
  }
  await widget.context.ready;
  return { path: target, panel: widget };
}

/**
 * Map a requested kernel name or language onto an installed kernel spec.
 *
 * Returns `undefined` when the request cannot be matched, which lets the
 * document manager fall back to the application default.
 */
export async function resolveKernelName(
  env: IJupyterEnv,
  requested?: string | null
): Promise<string | undefined> {
  if (!requested) {
    return undefined;
  }
  const manager = env.app.serviceManager.kernelspecs;
  await manager.ready;
  const specs = manager.specs?.kernelspecs ?? {};
  const wanted = requested.toLowerCase();
  const names = Object.keys(specs);
  for (let i = 0; i < names.length; i++) {
    if (names[i].toLowerCase() === wanted) {
      return names[i];
    }
  }
  for (let i = 0; i < names.length; i++) {
    const spec = specs[names[i]];
    if (spec && spec.language && spec.language.toLowerCase() === wanted) {
      return names[i];
    }
  }
  return undefined;
}

/** Save a notebook through the normal document save path. */
export async function saveNotebook(
  env: IJupyterEnv,
  path?: string | null
): Promise<{ saved: boolean; path: string; dirty: boolean }> {
  const panel = await resolveNotebook(env, path);
  await panel.context.save();
  return {
    saved: true,
    path: panel.context.path,
    dirty: panel.context.model.dirty
  };
}

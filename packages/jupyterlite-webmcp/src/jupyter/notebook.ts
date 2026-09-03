import { INotebookModel, NotebookPanel } from '@jupyterlab/notebook';

import {
  assertNotebookAccessible,
  notebookAccessOfContent,
  notebookAccessOfPanel
} from '../access/notebook';
import type { AccessIntent } from '../access/guard';
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
  /**
   * What the caller intends to do with the notebook: `'read'` only requires
   * it to be visible at all; `'write'` additionally refuses a notebook the
   * owner restricted to read-only. Defaults to `'read'`, so call sites that
   * mutate must opt into the stricter check deliberately.
   */
  intent?: AccessIntent;
}

/** How long to wait for a kernel spec to be contributed before giving up. */
const KERNEL_SPEC_TIMEOUT_MS = 10000;

/** How often to re-check the kernel spec registry while waiting. */
const KERNEL_SPEC_POLL_MS = 50;

/**
 * Wait until the service manager is ready and at least one kernel spec has
 * actually been registered.
 *
 * In JupyterLite the kernels are contributed by frontend extensions during
 * start-up, so a tool invoked very early would otherwise see no kernels at all
 * and open a notebook that has no kernel to attach.
 */
async function serviceManagerReady(env: IJupyterEnv): Promise<void> {
  try {
    await env.app.serviceManager.ready;
    const manager = env.app.serviceManager.kernelspecs;
    await manager.ready;

    // In JupyterLite the kernels are contributed by frontend plugins, so
    // `ready` resolves before any of them has registered: measured against the
    // deployed site, the registry is still empty when `ready` settles and the
    // Python kernel appears about half a second later. Waiting for `ready`
    // alone is therefore not enough, and opening a notebook at that moment
    // gets no kernel and pops a "Select Kernel" dialog at the user.
    const deadline = Date.now() + KERNEL_SPEC_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const specs = manager.specs?.kernelspecs;
      if (specs && Object.keys(specs).length > 0) {
        return;
      }
      await new Promise(resolve =>
        window.setTimeout(resolve, KERNEL_SPEC_POLL_MS)
      );
    }
  } catch {
    // A service that never becomes ready must not block a notebook from
    // opening; the notebook simply opens without a kernel, which is exactly
    // what happens in a JupyterLite deployment that ships no kernel at all.
  }
}

/**
 * Resolve a notebook panel from an optional path.
 *
 * With no path this returns the notebook the human is currently working in.
 * With a path it reuses an already-open panel when there is one, so tools
 * always read the live model including unsaved edits, never the bytes on disk.
 *
 * Notebook-level agent access (`src/access/notebook.ts`) is enforced here,
 * once, for every tool: a notebook the owner hid (`'none'`) throws exactly
 * the `NOTEBOOK_NOT_FOUND` a nonexistent path would — the agent can never
 * learn from the error shape that a hidden file exists — and a notebook the
 * owner restricted to read-only throws `NOTEBOOK_ACCESS_DENIED` when the
 * caller declared a `'write'` intent.
 */
export async function resolveNotebook(
  env: IJupyterEnv,
  path?: string | null,
  options: IResolveOptions = {}
): Promise<NotebookPanel> {
  const activate = options.activate ?? false;
  const open = options.open ?? true;
  const intent = options.intent ?? 'read';

  if (path === null || path === undefined || path === '') {
    const panel = env.tracker.currentWidget;
    if (!panel) {
      throw toolError(
        'NO_ACTIVE_NOTEBOOK',
        'There is no notebook open. Open one first, or pass notebookPath.'
      );
    }
    await panel.context.ready;
    const access = notebookAccessOfPanel(panel);
    if (access === 'none') {
      // The current notebook is hidden from the agent: behave exactly as if
      // no notebook were open, leaking neither its path nor its existence.
      throw toolError(
        'NO_ACTIVE_NOTEBOOK',
        'There is no notebook open. Open one first, or pass notebookPath.'
      );
    }
    assertNotebookAccessible(panel.context.path, access, intent);
    if (activate) {
      env.app.shell.activateById(panel.id);
    }
    return panel;
  }

  const normalized = validatePath(path);
  const widget = env.docManager.findWidget(normalized);

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
    let saved: { type: string; content?: unknown };
    try {
      saved = await contentsManager(env).get(normalized, { content: true });
    } catch {
      throw toolError(
        'NOTEBOOK_NOT_FOUND',
        `No file exists at "${normalized}".`,
        { path: normalized }
      );
    }
    if (saved.type === 'notebook') {
      // Check the saved file's own access metadata *before* opening it, so a
      // hidden notebook is never visibly opened (or otherwise touched) on the
      // agent's behalf. The error is byte-identical to the not-on-disk case
      // above: same code, same message, same details.
      assertNotebookAccessible(
        normalized,
        notebookAccessOfContent(saved.content),
        intent
      );
    }
    const opened = env.docManager.openOrReveal(normalized, 'default', undefined, {
      activate
    });
    if (!(opened instanceof NotebookPanel)) {
      throw toolError(
        'NOTEBOOK_NOT_FOUND',
        `"${normalized}" is not a notebook.`,
        { path: normalized }
      );
    }
    await opened.context.ready;
    assertNotebookAccessible(
      normalized,
      notebookAccessOfPanel(opened),
      intent
    );
    return opened;
  }

  if (!(widget instanceof NotebookPanel)) {
    throw toolError(
      'NOTEBOOK_NOT_FOUND',
      `"${normalized}" is not a notebook.`,
      { path: normalized }
    );
  }
  await widget.context.ready;
  assertNotebookAccessible(normalized, notebookAccessOfPanel(widget), intent);
  if (activate) {
    env.app.shell.activateById(widget.id);
  }
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
  } catch {
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
 * Returns the requested kernel when it can be matched. With no request, use
 * the registered default explicitly: relying on `openOrReveal`'s implicit
 * fallback can leave a newly created JupyterLite notebook at the Select
 * Kernel prompt even though a usable default has already been registered.
 */
export async function resolveKernelName(
  env: IJupyterEnv,
  requested?: string | null
): Promise<string | undefined> {
  const manager = env.app.serviceManager.kernelspecs;
  await manager.ready;
  const specs = manager.specs?.kernelspecs ?? {};
  if (!requested) {
    const defaultName = manager.specs?.default;
    if (defaultName && specs[defaultName]) {
      return defaultName;
    }
    // JupyterLite's Pyodide extension can register usable specs without
    // populating `KernelSpecManager.specs.default`. Prefer its Python spec,
    // then fall back deterministically to the first registered spec, so a
    // new notebook never falls through to the Select Kernel prompt merely
    // because the optional default field is absent.
    const names = Object.keys(specs);
    const python = names.find(
      name => name.toLowerCase() === 'python' || specs[name]?.language?.toLowerCase() === 'python'
    );
    return python ?? names[0];
  }
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
  const panel = await resolveNotebook(env, path, { intent: 'write' });
  await panel.context.save();
  return {
    saved: true,
    path: panel.context.path,
    dirty: panel.context.model.dirty
  };
}

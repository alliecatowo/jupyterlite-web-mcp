/**
 * Notebook-level agent access control: the human owner decides, per notebook,
 * what a connected agent may do with the whole file — `write` (the default,
 * normal per-cell rules apply), `read` (the agent may list, open and read the
 * notebook, but every tool that would mutate it is refused), or `none` (the
 * notebook is hidden from the agent entirely, indistinguishable from a file
 * that does not exist).
 *
 * Mirrors `src/access/model.ts`/`src/access/guard.ts` (the per-cell feature)
 * on purpose: the state lives under the same `jupyterlite_webmcp` metadata
 * key, this time on the *notebook's* own metadata, so it travels with the
 * `.ipynb` file exactly like cell access and review threads do. It is set
 * entirely by the human, from the file-browser context menu or the Agent
 * panel's Access section — no WebMCP tool can read or change it.
 */
import { NotebookPanel } from '@jupyterlab/notebook';

import { Contents } from '@jupyterlab/services';

import { toolError } from '../jupyter/errors';
import { contentsManager, IJupyterEnv } from '../jupyter/workspace';
import { AccessIntent } from './guard';
import { CELL_METADATA_KEY } from './model';

/** What a connected agent may do with a whole notebook. Absent means 'write'. */
export type NotebookAccess = 'write' | 'read' | 'none';

/** The access level a notebook has when its metadata carries no explicit value. */
export const DEFAULT_NOTEBOOK_ACCESS: NotebookAccess = 'write';

/** The notebook metadata key, the same name the per-cell feature uses on cells. */
export const NOTEBOOK_METADATA_KEY = CELL_METADATA_KEY;

/** The `jupyterlite_webmcp` notebook metadata object. */
export interface INotebookAccessMetadata {
  /** What a connected agent may do with this notebook. Absent means 'write'. */
  notebookAccess?: NotebookAccess;
}

/** The narrow shape of a live notebook's shared model this module relies on. */
interface ISharedNotebookMetadataHost {
  getMetadata(): Record<string, unknown>;
  getMetadata(key: string): unknown;
  setMetadata(key: string, value: unknown): void;
  deleteMetadata(key: string): void;
  transact?(f: () => void, undoable?: boolean): void;
}

function isNotebookAccess(value: unknown): value is NotebookAccess {
  return value === 'write' || value === 'read' || value === 'none';
}

/**
 * Defensively normalizes arbitrary, possibly-malformed notebook metadata into
 * a well-formed {@link INotebookAccessMetadata}. Never throws.
 */
export function normalizeNotebookMetadata(
  raw: unknown
): INotebookAccessMetadata {
  try {
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    const data = raw as Record<string, unknown>;
    const result: INotebookAccessMetadata = {};
    if (isNotebookAccess(data.notebookAccess)) {
      result.notebookAccess = data.notebookAccess;
    }
    return result;
  } catch {
    return {};
  }
}

/** The effective access level: `metadata.notebookAccess`, defaulting to 'write'. */
export function effectiveNotebookAccess(
  metadata: INotebookAccessMetadata
): NotebookAccess {
  return metadata.notebookAccess ?? DEFAULT_NOTEBOOK_ACCESS;
}

/** Cycles `write -> read -> none -> write`, for the toggle control. */
export function nextNotebookAccess(current: NotebookAccess): NotebookAccess {
  if (current === 'write') {
    return 'read';
  }
  if (current === 'read') {
    return 'none';
  }
  return 'write';
}

/** A plain-language sentence naming the current access state. */
export function notebookAccessLabel(access: NotebookAccess): string {
  switch (access) {
    case 'read':
      return 'Agent may read this notebook, but not change it';
    case 'none':
      return 'Hidden from the agent';
    default:
      return 'Agent may edit this notebook';
  }
}

/** A short label for the access state, for compact UI (menu labels). */
export function notebookAccessShortLabel(access: NotebookAccess): string {
  switch (access) {
    case 'read':
      return 'Read only';
    case 'none':
      return 'Hidden';
    default:
      return 'Editable';
  }
}

function panelSharedModel(
  panel: NotebookPanel
): ISharedNotebookMetadataHost | null {
  const shared = panel.context.model
    .sharedModel as unknown as ISharedNotebookMetadataHost;
  if (!shared || typeof shared.getMetadata !== 'function') {
    return null;
  }
  return shared;
}

/**
 * Reads a notebook's effective agent access from its *live* model, so an
 * unsaved owner change applies to the agent immediately. Degrades to
 * `'write'` when the shared model cannot be read.
 */
export function notebookAccessOfPanel(panel: NotebookPanel): NotebookAccess {
  try {
    const shared = panelSharedModel(panel);
    if (!shared) {
      return DEFAULT_NOTEBOOK_ACCESS;
    }
    return effectiveNotebookAccess(
      normalizeNotebookMetadata(shared.getMetadata(NOTEBOOK_METADATA_KEY))
    );
  } catch {
    return DEFAULT_NOTEBOOK_ACCESS;
  }
}

/**
 * Persists a notebook-level access change on the live model. This is the only
 * way a notebook's access ever changes for an open notebook: no WebMCP tool
 * calls it, by design — only the human's file-browser control
 * (`src/access/commands.ts`) and the Agent panel's Access section do.
 * Setting `'write'` (the default) removes the key entirely, so a notebook
 * the owner never restricted stays indistinguishable from one that predates
 * this feature (the key carries nothing but `notebookAccess`, so there is
 * nothing else to preserve). Written outside the undo stack, like every
 * other access/provenance metadata write.
 */
export function setNotebookAccess(
  panel: NotebookPanel,
  access: NotebookAccess
): void {
  const shared = panelSharedModel(panel);
  if (!shared || typeof shared.setMetadata !== 'function') {
    return;
  }
  const apply = (): void => {
    if (access === 'write') {
      shared.deleteMetadata(NOTEBOOK_METADATA_KEY);
      return;
    }
    shared.setMetadata(NOTEBOOK_METADATA_KEY, { notebookAccess: access });
  };
  if (typeof shared.transact === 'function') {
    shared.transact(apply, false);
  } else {
    apply();
  }
}

/** Parses notebook access out of a raw `.ipynb` content model. */
export function notebookAccessOfContent(
  content: unknown
): NotebookAccess {
  const parsed = content as { metadata?: unknown } | null;
  const metadata =
    parsed && typeof parsed === 'object' && parsed.metadata
      ? (parsed.metadata as Record<string, unknown>)[NOTEBOOK_METADATA_KEY]
      : undefined;
  return effectiveNotebookAccess(normalizeNotebookMetadata(metadata));
}

/**
 * Reads a notebook's effective agent access from wherever the truth currently
 * lives: the live model when the notebook is open (unsaved owner changes
 * apply immediately), otherwise the saved file itself. Degrades to `'write'`
 * on any failure — lockdown must never brick a workspace — and never opens
 * the notebook.
 */
export async function notebookAccessOf(
  env: IJupyterEnv,
  path: string
): Promise<NotebookAccess> {
  const widget = env.docManager.findWidget(path);
  if (widget instanceof NotebookPanel) {
    return notebookAccessOfPanel(widget);
  }
  try {
    const model = await contentsManager(env).get(path, { content: true });
    if (model.type !== 'notebook') {
      return DEFAULT_NOTEBOOK_ACCESS;
    }
    return notebookAccessOfContent(model.content);
  } catch {
    return DEFAULT_NOTEBOOK_ACCESS;
  }
}

/**
 * The notebook-level checkpoint, mirroring `assertCellAccessible`. A `'none'`
 * notebook throws exactly the `NOTEBOOK_NOT_FOUND` a nonexistent path would
 * (same code, same message, same details), so a hidden notebook cannot be
 * probed for; `NOTEBOOK_ACCESS_DENIED` is reserved for a `'read'` notebook
 * under a write intent, where the agent legitimately already knows the
 * notebook exists (it can be listed and opened).
 */
export function assertNotebookAccessible(
  path: string,
  access: NotebookAccess,
  intent: AccessIntent
): void {
  if (access === 'none') {
    throw toolError('NOTEBOOK_NOT_FOUND', `No file exists at "${path}".`, {
      path
    });
  }
  if (intent === 'write' && access === 'read') {
    throw toolError(
      'NOTEBOOK_ACCESS_DENIED',
      `The notebook owner restricted "${path}" to read-only for agents: it can be read and navigated, but not edited, executed, saved, or commented on.`,
      { path, access }
    );
  }
}

/**
 * Writes a notebook-level access change straight to a notebook file that is
 * not currently open — the file-browser command's path, where there is no
 * live panel to write through. Takes the contents manager directly because
 * the UI command that calls this has no `IJupyterEnv`.
 */
export async function writeNotebookAccessToFile(
  contents: Contents.IManager,
  path: string,
  access: NotebookAccess
): Promise<void> {
  const model = await contents.get(path, { content: true });
  if (model.type !== 'notebook') {
    return;
  }
  const content = model.content as Contents.IModel['content'] & {
    metadata?: Record<string, unknown>;
  };
  const metadata = { ...(content.metadata ?? {}) };
  if (access === 'write') {
    delete metadata[NOTEBOOK_METADATA_KEY];
  } else {
    metadata[NOTEBOOK_METADATA_KEY] = { notebookAccess: access };
  }
  await contents.save(path, {
    type: 'notebook',
    format: 'json',
    content: { ...content, metadata }
  });
}

/**
 * Notebook-level agent access control (`src/access/notebook.ts`) and its
 * enforcement in `resolveNotebook`, `listWorkspace` and `getContext`.
 *
 * The `@jupyterlab/notebook` mock follows `tests/unit/notebook-resolution.spec.ts`:
 * `resolveNotebook` uses `widget instanceof NotebookPanel` on the "already
 * open" branch, so fakes are made real instances of a trivial mock class.
 */
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { NotebookPanel } from '@jupyterlab/notebook';

import {
  assertNotebookAccessible,
  effectiveNotebookAccess,
  nextNotebookAccess,
  notebookAccessLabel,
  notebookAccessOfContent,
  notebookAccessOfPanel,
  notebookAccessShortLabel,
  normalizeNotebookMetadata,
  setNotebookAccess,
  writeNotebookAccessToFile
} from '../../src/access/notebook';
import { ToolError } from '../../src/jupyter/errors';
import { getContext } from '../../src/jupyter/focus';
import { resolveNotebook } from '../../src/jupyter/notebook';
import { listWorkspace } from '../../src/jupyter/workspace';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

const KEY = 'jupyterlite_webmcp';

function makeSharedModel(stored: Record<string, unknown> = {}) {
  let meta: Record<string, unknown> = { ...stored };
  const calls: { undoable?: boolean }[] = [];
  return {
    calls,
    get callsMeta() {
      return meta;
    },
    getMetadata(key?: string) {
      if (key === undefined) {
        return { ...meta };
      }
      return meta[key];
    },
    setMetadata(key: string, value: unknown) {
      meta = { ...meta, [key]: value };
    },
    deleteMetadata(key: string) {
      const rest = { ...meta };
      delete rest[key];
      meta = rest;
    },
    transact(f: () => void, undoable?: boolean) {
      calls.push({ undoable });
      f();
    }
  };
}

function makePanel(path: string, stored: Record<string, unknown> = {}) {
  const panel = Object.create(NotebookPanel.prototype);
  const sharedModel = makeSharedModel(stored);
  panel.context = { ready: Promise.resolve(), path, model: { sharedModel } };
  panel.content = {};
  return { panel, sharedModel };
}

function makeServiceManager() {
  return {
    ready: Promise.resolve(),
    kernelspecs: {
      ready: Promise.resolve(),
      specs: { kernelspecs: { python3: {} } }
    }
  };
}

function makeEnv(options: {
  currentWidget?: unknown;
  findWidget?: (path: string) => unknown;
  contentsGet?: jest.Mock;
  shellWidgets?: unknown[];
}): { env: IJupyterEnv; contentsGet: jest.Mock } {
  const contentsGet =
    options.contentsGet ?? jest.fn().mockResolvedValue({ path: 'x' });
  const docManager = {
    findWidget: jest.fn((path: string) =>
      options.findWidget ? options.findWidget(path) : undefined
    ),
    openOrReveal: jest.fn(),
    services: { contents: { get: contentsGet, save: jest.fn() } }
  };
  const widgets = options.shellWidgets ?? [];
  let index = 0;
  const env = {
    app: {
      serviceManager: makeServiceManager(),
      shell: {
        activateById: jest.fn(),
        widgets: () => ({
          next: () => {
            if (index < widgets.length) {
              return { done: false, value: widgets[index++] };
            }
            return { done: true, value: undefined };
          }
        })
      }
    },
    docManager,
    tracker: { currentWidget: options.currentWidget ?? null },
    fileBrowser: null
  } as unknown as IJupyterEnv;
  return { env, contentsGet };
}

describe('normalizeNotebookMetadata', () => {
  it('defaults to an empty object for missing or malformed input', () => {
    expect(normalizeNotebookMetadata(undefined)).toEqual({});
    expect(normalizeNotebookMetadata(null)).toEqual({});
    expect(normalizeNotebookMetadata('read')).toEqual({});
    expect(normalizeNotebookMetadata({ notebookAccess: 'everyone' })).toEqual(
      {}
    );
  });

  it('keeps a valid access level', () => {
    expect(normalizeNotebookMetadata({ notebookAccess: 'read' })).toEqual({
      notebookAccess: 'read'
    });
    expect(normalizeNotebookMetadata({ notebookAccess: 'none' })).toEqual({
      notebookAccess: 'none'
    });
  });
});

describe('effectiveNotebookAccess / nextNotebookAccess / labels', () => {
  it('defaults to write when unset', () => {
    expect(effectiveNotebookAccess({})).toBe('write');
  });

  it('cycles write -> read -> none -> write', () => {
    expect(nextNotebookAccess('write')).toBe('read');
    expect(nextNotebookAccess('read')).toBe('none');
    expect(nextNotebookAccess('none')).toBe('write');
  });

  it('names every state in plain language', () => {
    expect(notebookAccessLabel('write')).toMatch(/edit/i);
    expect(notebookAccessLabel('read')).toMatch(/read/i);
    expect(notebookAccessLabel('none')).toMatch(/hidden/i);
    expect(notebookAccessShortLabel('write')).toBe('Editable');
    expect(notebookAccessShortLabel('read')).toBe('Read only');
    expect(notebookAccessShortLabel('none')).toBe('Hidden');
  });
});

describe('assertNotebookAccessible', () => {
  it('throws NOTEBOOK_NOT_FOUND for a hidden notebook, byte-identical to a missing file', () => {
    let caught: unknown;
    try {
      assertNotebookAccessible('secret.ipynb', 'none', 'read');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).toJSON()).toEqual({
      error: 'NOTEBOOK_NOT_FOUND',
      message: 'No file exists at "secret.ipynb".',
      path: 'secret.ipynb'
    });
  });

  it('throws NOTEBOOK_ACCESS_DENIED for a read-only notebook under a write intent', () => {
    let caught: unknown;
    try {
      assertNotebookAccessible('notes.ipynb', 'read', 'write');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToolError);
    const json = (caught as ToolError).toJSON();
    expect(json.error).toBe('NOTEBOOK_ACCESS_DENIED');
    expect(json.path).toBe('notes.ipynb');
  });

  it('allows reads of read-only notebooks and everything on write notebooks', () => {
    expect(() =>
      assertNotebookAccessible('notes.ipynb', 'read', 'read')
    ).not.toThrow();
    expect(() =>
      assertNotebookAccessible('notes.ipynb', 'write', 'write')
    ).not.toThrow();
  });
});

describe('setNotebookAccess / notebookAccessOfPanel', () => {
  it('reads the live model, so an unsaved owner change applies immediately', () => {
    const { panel } = makePanel('a.ipynb');
    expect(notebookAccessOfPanel(panel)).toBe('write');
    setNotebookAccess(panel, 'read');
    expect(notebookAccessOfPanel(panel)).toBe('read');
  });

  it('writes outside the undo stack and removes the key when reset to write', () => {
    const { panel, sharedModel } = makePanel('a.ipynb');
    setNotebookAccess(panel, 'none');
    expect(sharedModel.callsMeta[KEY]).toEqual({ notebookAccess: 'none' });
    expect(sharedModel.calls[0]).toEqual({ undoable: false });
    setNotebookAccess(panel, 'write');
    expect(KEY in sharedModel.callsMeta).toBe(false);
  });

  it('degrades to write when the shared model cannot be read', () => {
    const panel = Object.create(NotebookPanel.prototype);
    panel.context = { ready: Promise.resolve(), path: 'a.ipynb', model: {} };
    expect(notebookAccessOfPanel(panel)).toBe('write');
  });
});

describe('notebookAccessOfContent', () => {
  it('parses saved .ipynb metadata', () => {
    expect(notebookAccessOfContent(null)).toBe('write');
    expect(
      notebookAccessOfContent({
        metadata: { [KEY]: { notebookAccess: 'none' } }
      })
    ).toBe('none');
    expect(
      notebookAccessOfContent({
        metadata: { [KEY]: { notebookAccess: 'bogus' } }
      })
    ).toBe('write');
  });
});

describe('writeNotebookAccessToFile', () => {
  it('sets and clears the file metadata for a closed notebook', async () => {
    const content = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
    const get = jest.fn().mockResolvedValue({ type: 'notebook', content });
    const save = jest.fn().mockResolvedValue({});
    await writeNotebookAccessToFile(
      { get, save } as unknown as never,
      'closed.ipynb',
      'read'
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].content.metadata[KEY]).toEqual({
      notebookAccess: 'read'
    });
    await writeNotebookAccessToFile(
      { get, save } as unknown as never,
      'closed.ipynb',
      'write'
    );
    expect(KEY in save.mock.calls[1][1].content.metadata).toBe(false);
  });

  it('leaves non-notebook files alone', async () => {
    const get = jest.fn().mockResolvedValue({ type: 'file', content: 'x' });
    const save = jest.fn();
    await writeNotebookAccessToFile(
      { get, save } as unknown as never,
      'data.csv',
      'none'
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe('resolveNotebook notebook-level enforcement', () => {
  it('resolves a read-only notebook for reads but refuses writes with NOTEBOOK_ACCESS_DENIED', async () => {
    const { panel } = makePanel('notes.ipynb', {
      [KEY]: { notebookAccess: 'read' }
    });
    const { env } = makeEnv({});
    (env.docManager.findWidget as jest.Mock).mockReturnValue(panel);

    const read = await resolveNotebook(env, 'notes.ipynb');
    expect(read).toBe(panel);

    let caught: unknown;
    try {
      await resolveNotebook(env, 'notes.ipynb', { intent: 'write' });
    } catch (error) {
      caught = error;
    }
    expect((caught as ToolError).code).toBe('NOTEBOOK_ACCESS_DENIED');
  });

  it('reports a hidden open notebook as NOTEBOOK_NOT_FOUND, like a missing file', async () => {
    const { panel } = makePanel('secret.ipynb', {
      [KEY]: { notebookAccess: 'none' }
    });
    const { env } = makeEnv({});
    (env.docManager.findWidget as jest.Mock).mockReturnValue(panel);

    let caught: unknown;
    try {
      await resolveNotebook(env, 'secret.ipynb');
    } catch (error) {
      caught = error;
    }
    expect((caught as ToolError).toJSON()).toEqual({
      error: 'NOTEBOOK_NOT_FOUND',
      message: 'No file exists at "secret.ipynb".',
      path: 'secret.ipynb'
    });
    expect(env.docManager.openOrReveal as jest.Mock).not.toHaveBeenCalled();
  });

  it('treats a hidden current notebook as no open notebook', async () => {
    const { panel } = makePanel('secret.ipynb', {
      [KEY]: { notebookAccess: 'none' }
    });
    const { env } = makeEnv({ currentWidget: panel });

    let caught: unknown;
    try {
      await resolveNotebook(env, null);
    } catch (error) {
      caught = error;
    }
    expect((caught as ToolError).code).toBe('NO_ACTIVE_NOTEBOOK');
  });

  it('never opens a hidden notebook that is not already open', async () => {
    const contentsGet = jest.fn().mockResolvedValue({
      type: 'notebook',
      content: { metadata: { [KEY]: { notebookAccess: 'none' } } }
    });
    const { env } = makeEnv({ contentsGet });

    let caught: unknown;
    try {
      await resolveNotebook(env, 'secret.ipynb');
    } catch (error) {
      caught = error;
    }
    expect((caught as ToolError).toJSON()).toEqual({
      error: 'NOTEBOOK_NOT_FOUND',
      message: 'No file exists at "secret.ipynb".',
      path: 'secret.ipynb'
    });
    expect(env.docManager.openOrReveal as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('listWorkspace notebook-level enforcement', () => {
  function listingGet() {
    return jest.fn(async (path: string, opts?: { content?: boolean }) => {
      if (!opts?.content) {
        throw new Error('expected content:true');
      }
      if (path === '') {
        return {
          type: 'directory',
          content: [
            { type: 'notebook', path: 'notes.ipynb', name: 'notes.ipynb' },
            { type: 'notebook', path: 'secret.ipynb', name: 'secret.ipynb' },
            { type: 'file', path: 'data.csv', name: 'data.csv' }
          ]
        };
      }
      if (path === 'secret.ipynb') {
        return {
          type: 'notebook',
          content: { metadata: { [KEY]: { notebookAccess: 'none' } } }
        };
      }
      return { type: 'notebook', content: { metadata: {} } };
    });
  }

  it('omits hidden notebooks silently, without a count or placeholder', async () => {
    const { env } = makeEnv({ contentsGet: listingGet() });
    const result = await listWorkspace(env, {});
    expect(result.entries.map(entry => entry.path).sort()).toEqual([
      'data.csv',
      'notes.ipynb'
    ]);
    expect(result).not.toHaveProperty('hiddenNotebookCount');
    expect(JSON.stringify(result)).not.toContain('hiddenNotebook');
  });

  it('still lists a read-only notebook', async () => {
    const get = listingGet();
    const { env } = makeEnv({ contentsGet: get });
    const result = await listWorkspace(env, {});
    expect(result.entries.some(entry => entry.path === 'notes.ipynb')).toBe(
      true
    );
  });
});

describe('getContext notebook-level enforcement', () => {
  it('reads like no notebook is open when the current one is hidden', async () => {
    const { panel } = makePanel('secret.ipynb', {
      [KEY]: { notebookAccess: 'none' }
    });
    const { env } = makeEnv({
      currentWidget: panel,
      findWidget: () => panel,
      shellWidgets: [{ context: { path: 'secret.ipynb' } }]
    });

    const context = await getContext(env);
    expect(context.notebook).toBeNull();
    expect(context.focus).toBeNull();
    expect(context.kernel).toBeNull();
    expect(context.review).toBeNull();
    expect(context.workspace.openDocuments).toEqual([]);
  });
});

/**
 * `resolveNotebook` (src/jupyter/notebook.ts) checks `widget instanceof
 * NotebookPanel` on the "path is already open" branch, so a plain fake
 * object fails that check. Rather than importing the real (ESM,
 * Jest-unparseable) `@jupyterlab/notebook` package, mock it with a trivial
 * class and make the fakes real instances of it. This is the simpler of the
 * two options the task allows: every other branch below never reaches the
 * `instanceof` check at all, so only the "already open" case needs it.
 */
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { NotebookPanel } from '@jupyterlab/notebook';

import {
  createNotebook,
  notebookInfo,
  resolveNotebook
} from '../../src/jupyter/notebook';
import { ToolError } from '../../src/jupyter/errors';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

function makeFakePanel(path: string): unknown {
  const panel = Object.create(NotebookPanel.prototype);
  panel.context = {
    ready: Promise.resolve(),
    path
  };
  return panel;
}

/**
 * A `serviceManager` whose kernel spec registry is already populated, so
 * `resolveNotebook`'s wait for kernel specs to appear resolves immediately
 * instead of polling for up to 10 seconds.
 */
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
  findWidgetResult?: unknown;
  contentsGet?: jest.Mock;
}): {
  env: IJupyterEnv;
  docManager: { findWidget: jest.Mock; openOrReveal: jest.Mock };
} {
  const findWidget = jest.fn().mockReturnValue(options.findWidgetResult);
  const openOrReveal = jest.fn().mockReturnValue(options.findWidgetResult);
  const contentsGet =
    options.contentsGet ?? jest.fn().mockResolvedValue({ path: 'x' });

  const docManager = {
    findWidget,
    openOrReveal,
    services: {
      contents: {
        get: contentsGet
      }
    }
  };

  const env = {
    app: {
      serviceManager: makeServiceManager(),
      shell: { activateById: jest.fn() }
    },
    docManager,
    tracker: { currentWidget: options.currentWidget ?? null },
    fileBrowser: null
  } as unknown as IJupyterEnv;

  return { env, docManager };
}

describe('resolveNotebook', () => {
  it('returns the current widget when no path is given and one is open', async () => {
    const panel = makeFakePanel('/a.ipynb');
    const { env } = makeEnv({ currentWidget: panel });

    const result = await resolveNotebook(env, undefined);

    expect(result).toBe(panel);
  });

  it('throws NO_ACTIVE_NOTEBOOK when no path is given and nothing is open', async () => {
    const { env } = makeEnv({ currentWidget: null });

    let caught: unknown;
    try {
      await resolveNotebook(env, null);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('NO_ACTIVE_NOTEBOOK');
  });

  it('reuses an already-open widget for a given path without calling openOrReveal', async () => {
    const panel = makeFakePanel('notebooks/a.ipynb');
    const { env, docManager } = makeEnv({ findWidgetResult: panel });

    const result = await resolveNotebook(env, 'notebooks/a.ipynb');

    expect(result).toBe(panel);
    expect(docManager.openOrReveal).not.toHaveBeenCalled();
  });

  it('throws NOTEBOOK_NOT_FOUND for a path that is not open and does not exist', async () => {
    const contentsGet = jest.fn().mockRejectedValue(new Error('no such file'));
    const { env, docManager } = makeEnv({
      findWidgetResult: undefined,
      contentsGet
    });

    let caught: unknown;
    try {
      await resolveNotebook(env, 'missing.ipynb');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('NOTEBOOK_NOT_FOUND');
    expect(docManager.openOrReveal).not.toHaveBeenCalled();
  });

  it.each(['../escape.ipynb', '/abs'])(
    'throws INVALID_PATH for %p before touching the doc manager',
    async invalidPath => {
      const { env, docManager } = makeEnv({});

      let caught: unknown;
      try {
        await resolveNotebook(env, invalidPath);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ToolError);
      expect((caught as ToolError).code).toBe('INVALID_PATH');
      expect(docManager.findWidget).not.toHaveBeenCalled();
    }
  );

  it('throws NOTEBOOK_NOT_FOUND instead of opening when open: false and the path is not open', async () => {
    const contentsGet = jest.fn().mockResolvedValue({ path: 'a.ipynb' });
    const { env, docManager } = makeEnv({
      findWidgetResult: undefined,
      contentsGet
    });

    let caught: unknown;
    try {
      await resolveNotebook(env, 'a.ipynb', { open: false });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolError);
    expect((caught as ToolError).code).toBe('NOTEBOOK_NOT_FOUND');
    expect(contentsGet).not.toHaveBeenCalled();
    expect(docManager.openOrReveal).not.toHaveBeenCalled();
  });

  it.each(['file', 'directory'])(
    'rejects a %s path as not a notebook without opening it on screen',
    async type => {
      const contentsGet = jest
        .fn()
        .mockResolvedValue({ path: 'data.csv', type, content: 'a,b' });
      const { env, docManager } = makeEnv({
        findWidgetResult: undefined,
        contentsGet
      });

      let caught: unknown;
      try {
        await resolveNotebook(env, 'data.csv');
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ToolError);
      expect((caught as ToolError).code).toBe('NOTEBOOK_NOT_FOUND');
      expect((caught as ToolError).message).toContain('is not a notebook');
      expect(docManager.openOrReveal).not.toHaveBeenCalled();
    }
  );
});

describe('createNotebook', () => {
  function makeCreateEnv(contents: Record<string, jest.Mock>): IJupyterEnv {
    return {
      app: {
        serviceManager: makeServiceManager(),
        shell: { activateById: jest.fn() }
      },
      docManager: {
        findWidget: jest.fn().mockReturnValue(undefined),
        openOrReveal: jest.fn(),
        services: { contents }
      },
      tracker: { currentWidget: null },
      fileBrowser: null
    } as unknown as IJupyterEnv;
  }

  async function failure(promise: Promise<unknown>): Promise<ToolError> {
    try {
      await promise;
    } catch (error) {
      return error as ToolError;
    }
    throw new Error('expected a failure');
  }

  it('reports PATH_EXISTS for an existing visible notebook', async () => {
    const env = makeCreateEnv({
      get: jest.fn().mockResolvedValue({
        type: 'notebook',
        content: { metadata: {} }
      })
    });
    const error = await failure(createNotebook(env, { name: 'visible' }));
    expect(error.code).toBe('PATH_EXISTS');
  });

  it('makes an existing hidden notebook indistinguishable from a failed creation', async () => {
    const hiddenEnv = makeCreateEnv({
      get: jest.fn().mockResolvedValue({
        type: 'notebook',
        content: {
          metadata: { jupyterlite_webmcp: { notebookAccess: 'none' } }
        }
      })
    });
    const hidden = await failure(createNotebook(hiddenEnv, { name: 'secret' }));

    const remove = jest.fn().mockResolvedValue(undefined);
    const failingEnv = makeCreateEnv({
      get: jest.fn().mockRejectedValue(new Error('missing')),
      newUntitled: jest.fn().mockResolvedValue({ path: 'Untitled.ipynb' }),
      rename: jest.fn().mockRejectedValue(new Error('rename failed')),
      delete: remove
    });
    const failed = await failure(
      createNotebook(failingEnv, { name: 'secret' })
    );

    expect(hidden.code).not.toBe('PATH_EXISTS');
    expect(hidden.toJSON()).toEqual(failed.toJSON());
    // The failed creation does not leave a stray Untitled notebook behind.
    expect(remove).toHaveBeenCalledWith('Untitled.ipynb');
  });
});

describe('notebookInfo revision', () => {
  function cell(id: string, source: { value: string }, access?: string) {
    return {
      id,
      type: 'code',
      sharedModel: {
        getSource: () => source.value,
        getMetadata: (key: string) =>
          key === 'jupyterlite_webmcp' && access ? { access } : undefined
      }
    };
  }

  function panelOf(cells: unknown[]): NotebookPanel {
    return {
      context: {
        path: 'n.ipynb',
        model: {
          dirty: false,
          cells: { length: cells.length, get: (i: number) => cells[i] }
        }
      }
    } as unknown as NotebookPanel;
  }

  it('ignores edits to hidden cells but tracks visible ones', () => {
    const visible = { value: 'x = 1' };
    const hidden = { value: 'secret = 1' };
    const panel = panelOf([cell('a', visible), cell('h', hidden, 'none')]);

    const before = notebookInfo(panel).revision;
    hidden.value = 'secret = 2';
    expect(notebookInfo(panel).revision).toBe(before);

    visible.value = 'x = 2';
    expect(notebookInfo(panel).revision).not.toBe(before);
  });
});

/**
 * `resolveKernelName` (src/jupyter/notebook.ts) picks the kernel a newly
 * created notebook opens with. Its no-request branch exists because
 * JupyterLite's Pyodide extension can register perfectly usable specs
 * without populating the optional `KernelSpecManager.specs.default`, and
 * relying on the document manager's implicit fallback then drops a new
 * notebook at the Select Kernel prompt.
 *
 * Note on scope, recorded because it is easy to misread: this function has a
 * single call site, inside `createNotebook`. It governs
 * `jupyter_create_notebook` only, and has no effect on opening a notebook
 * that already exists.
 */
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { resolveKernelName } from '../../src/jupyter/notebook';
import type { IJupyterEnv } from '../../src/jupyter/workspace';

function makeEnv(specs: {
  default?: string;
  kernelspecs: Record<string, { language?: string } | undefined>;
}): IJupyterEnv {
  return {
    app: {
      serviceManager: {
        kernelspecs: { ready: Promise.resolve(), specs }
      }
    },
    docManager: {},
    tracker: {},
    fileBrowser: null
  } as unknown as IJupyterEnv;
}

describe('resolveKernelName with no requested kernel', () => {
  it('uses the registered default when there is one', async () => {
    const env = makeEnv({
      default: 'python',
      kernelspecs: { python: { language: 'python' }, xpython: {} }
    });
    await expect(resolveKernelName(env)).resolves.toBe('python');
  });

  it('ignores a default that names a spec which is not registered', async () => {
    const env = makeEnv({
      default: 'ghost',
      kernelspecs: { python: { language: 'python' } }
    });
    await expect(resolveKernelName(env)).resolves.toBe('python');
  });

  it('prefers a Python spec when no default is registered', async () => {
    const env = makeEnv({
      kernelspecs: {
        javascript: { language: 'javascript' },
        python: { language: 'python' }
      }
    });
    await expect(resolveKernelName(env)).resolves.toBe('python');
  });

  it('matches a Python spec by language even when it is named otherwise', async () => {
    const env = makeEnv({
      kernelspecs: {
        deno: { language: 'typescript' },
        pyodide: { language: 'Python' }
      }
    });
    await expect(resolveKernelName(env)).resolves.toBe('pyodide');
  });

  it('falls back deterministically to the first spec when none is Python', async () => {
    const env = makeEnv({
      kernelspecs: { deno: { language: 'typescript' }, ir: { language: 'R' } }
    });
    await expect(resolveKernelName(env)).resolves.toBe('deno');
  });

  it('returns undefined when nothing is registered at all', async () => {
    const env = makeEnv({ kernelspecs: {} });
    await expect(resolveKernelName(env)).resolves.toBeUndefined();
  });
});

describe('resolveKernelName with a requested kernel', () => {
  it('matches a spec name case-insensitively', async () => {
    const env = makeEnv({ kernelspecs: { Python3: { language: 'python' } } });
    await expect(resolveKernelName(env, 'python3')).resolves.toBe('Python3');
  });

  it('falls back to matching on language', async () => {
    const env = makeEnv({ kernelspecs: { pyodide: { language: 'Python' } } });
    await expect(resolveKernelName(env, 'python')).resolves.toBe('pyodide');
  });

  it('prefers an exact name match over a language match', async () => {
    const env = makeEnv({
      kernelspecs: {
        pyodide: { language: 'python' },
        python: { language: 'python' }
      }
    });
    await expect(resolveKernelName(env, 'python')).resolves.toBe('python');
  });

  it('returns undefined for a request that matches nothing', async () => {
    const env = makeEnv({ kernelspecs: { python: { language: 'python' } } });
    await expect(resolveKernelName(env, 'haskell')).resolves.toBeUndefined();
  });
});

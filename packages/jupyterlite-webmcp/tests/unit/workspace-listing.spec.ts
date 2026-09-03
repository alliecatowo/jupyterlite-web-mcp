/**
 * A notebook the owner hid from the agent must be invisible in
 * `jupyter_list_workspace`: never listed, and never counted — not even
 * inside `omittedCount` once the result limit is reached, where the count
 * itself would leak that something exists.
 */
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import type { IJupyterEnv } from '../../src/jupyter/workspace';
import { listWorkspace } from '../../src/jupyter/workspace';

function fileModel(path: string, access?: string) {
  return {
    type: 'notebook',
    content: access
      ? { metadata: { jupyterlite_webmcp: { notebookAccess: access } } }
      : { metadata: {} }
  };
}

function makeEnv(): IJupyterEnv {
  const children = [
    { path: 'a.ipynb', name: 'a.ipynb', type: 'notebook' },
    { path: 'b.txt', name: 'b.txt', type: 'file' },
    { path: 'z.ipynb', name: 'z.ipynb', type: 'notebook' }
  ];
  const get = jest.fn(async (path: string) => {
    if (path === '') {
      return { type: 'directory', content: children };
    }
    if (path === 'a.ipynb') {
      return fileModel(path);
    }
    if (path === 'z.ipynb') {
      return fileModel(path, 'none');
    }
    throw new Error(`no file at ${path}`);
  });
  return {
    docManager: { services: { contents: { get } } }
  } as unknown as IJupyterEnv;
}

describe('listWorkspace hidden notebooks', () => {
  it('omits a hidden notebook without listing or counting it', async () => {
    const listing = await listWorkspace(makeEnv(), {});
    expect(listing.entries.map(entry => entry.path)).toEqual([
      'a.ipynb',
      'b.txt'
    ]);
    expect(listing.omittedCount).toBe(0);
    expect(listing.truncated).toBe(false);
  });

  it('does not count a hidden notebook in omittedCount when truncated', async () => {
    const listing = await listWorkspace(makeEnv(), { limit: 2 });
    expect(listing.entries.map(entry => entry.path)).toEqual([
      'a.ipynb',
      'b.txt'
    ]);
    expect(listing.omittedCount).toBe(0);
    expect(listing.truncated).toBe(false);
  });
});

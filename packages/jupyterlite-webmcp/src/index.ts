import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IStatusBar } from '@jupyterlab/statusbar';

import { IJupyterEnv } from './jupyter/workspace';
import { registerReviewCommands, ReviewCommandIDs } from './review/commands';
import { ReviewMarkers } from './review/markers';
import { ReviewPanel } from './review/panel';
import { ReviewStore } from './review/storage';
import { IReviewStore } from './tokens';
import { WebMCPStatus } from './ui/status';
import { WebMCPRegistry } from './webmcp/register';
import { buildTools } from './webmcp/tools';

/**
 * Notebook review threads.
 *
 * Ordinary notebook functionality: create, reply to, resolve and navigate
 * comments anchored to cells, source ranges and outputs. No agent required.
 */
const reviewPlugin: JupyterFrontEndPlugin<ReviewStore> = {
  id: 'jupyterlite-webmcp:review',
  description: 'Threaded review comments stored in notebook metadata.',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ILayoutRestorer],
  provides: IReviewStore,
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    restorer: ILayoutRestorer | null
  ): ReviewStore => {
    const store = new ReviewStore(tracker);

    const panel = new ReviewPanel({ app, tracker, store });
    panel.id = 'jupyterlite-webmcp-review';
    app.shell.add(panel, 'right', { rank: 900 });
    if (restorer) {
      restorer.add(panel, 'jupyterlite-webmcp-review');
    }

    registerReviewCommands({
      app,
      tracker,
      store,
      reveal: () => {
        app.shell.activateById(panel.id);
      }
    });

    const markers = new ReviewMarkers(tracker, store);
    app.shell.disposed.connect(() => markers.dispose());

    return store;
  }
};

/**
 * WebMCP tool registration.
 *
 * Progressive enhancement: when the browser exposes `document.modelContext`
 * the extension describes the notebook operations the user already has to
 * whatever agent is accompanying them. When it does not, nothing happens and
 * the application is unaffected.
 */
const webmcpPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlite-webmcp:tools',
  description:
    'Expose the live JupyterLite workspace to a compatible browser agent through WebMCP.',
  autoStart: true,
  requires: [INotebookTracker, IDocumentManager, IReviewStore],
  optional: [IDefaultFileBrowser, IStatusBar],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    docManager: IDocumentManager,
    review: ReviewStore,
    fileBrowser: IDefaultFileBrowser | null,
    statusBar: IStatusBar | null
  ): void => {
    const env: IJupyterEnv = { app, docManager, tracker, fileBrowser };
    const registry = new WebMCPRegistry();

    if (statusBar) {
      const item = new WebMCPStatus(registry);
      statusBar.registerStatusItem('jupyterlite-webmcp:status', {
        item,
        align: 'right',
        rank: 100
      });
    }

    void app.started.then(() => registry.register(buildTools(env, review)));
  }
};

export { ReviewCommandIDs, IReviewStore };

export default [reviewPlugin, webmcpPlugin];

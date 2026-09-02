import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IStatusBar } from '@jupyterlab/statusbar';

import { ActivityLog } from './activity/model';
import { ActivityMarkers } from './activity/markers';
import { ActivityPanel } from './activity/panel';
import { IJupyterEnv } from './jupyter/workspace';
import { registerReviewCommands, ReviewCommandIDs } from './review/commands';
import { ReviewMarkers } from './review/markers';
import { ReviewPanel } from './review/panel';
import { ReviewStore } from './review/storage';
import { IActivityLog, IReviewStore } from './tokens';
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
 * Presence / activity layer.
 *
 * Shows, in the ordinary spirit of collaborative-editor presence, what each
 * participant — the human, or the browser agent accompanying them — is
 * touching right now and did recently. Additive: the tools plugin works
 * exactly the same with or without it.
 */
const activityPlugin: JupyterFrontEndPlugin<ActivityLog> = {
  id: 'jupyterlite-webmcp:activity',
  description: 'Presence and recent-activity timeline for the notebook.',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ILayoutRestorer],
  provides: IActivityLog,
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    restorer: ILayoutRestorer | null
  ): ActivityLog => {
    const log = new ActivityLog();

    const panel = new ActivityPanel({ app, tracker, log });
    app.shell.add(panel, 'right', { rank: 901 });
    if (restorer) {
      restorer.add(panel, 'jupyterlite-webmcp-activity');
    }

    const markers = new ActivityMarkers(tracker, log);
    app.shell.disposed.connect(() => markers.dispose());

    return log;
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
  optional: [IDefaultFileBrowser, IStatusBar, IActivityLog],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    docManager: IDocumentManager,
    review: ReviewStore,
    fileBrowser: IDefaultFileBrowser | null,
    statusBar: IStatusBar | null,
    activity: ActivityLog | null
  ): void => {
    const env: IJupyterEnv = { app, docManager, tracker, fileBrowser };
    const registry = new WebMCPRegistry(activity ?? undefined);

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

export { ReviewCommandIDs, IReviewStore, IActivityLog };

export default [reviewPlugin, activityPlugin, webmcpPlugin];

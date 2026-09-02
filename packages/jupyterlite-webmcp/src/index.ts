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
import { registerAccessCommands, AccessCommandIDs } from './access/commands';
import { AccessMarkers } from './access/markers';
import { ProvenanceTracker } from './access/provenance';
import { IJupyterEnv } from './jupyter/workspace';
import { registerReviewCommands, ReviewCommandIDs } from './review/commands';
import { ReviewMarkers } from './review/markers';
import { ReviewPanel } from './review/panel';
import { ReviewStore } from './review/storage';
import { OutputSelectionTracker } from './selection/capture';
import { IActivityLog, IOutputSelectionTracker, IReviewStore } from './tokens';
import { AskAboutCommandIDs, AskAboutOutputAffordance, registerAskAboutCommands } from './ui/askAbout';
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
 * Per-cell agent access control and provenance.
 *
 * Ordinary notebook functionality: the human decides, per cell, what a
 * connected agent may do with it (write/read/none), and every cell keeps a
 * bounded, coalesced trail of who last changed it. Both work exactly the
 * same with no agent connected: the command, the markers, and the human-edit
 * provenance listener never touch `document.modelContext`.
 */
const accessPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlite-webmcp:access',
  description:
    'Per-cell agent access control (write/read/none) and cell provenance history.',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker): void => {
    registerAccessCommands({ app, tracker });

    const markers = new AccessMarkers(tracker);
    app.shell.disposed.connect(() => markers.dispose());

    const provenance = new ProvenanceTracker(tracker);
    app.shell.disposed.connect(() => provenance.dispose());
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

    const markers = new ActivityMarkers(tracker, log, {
      revealActivityPanel: () => app.shell.activateById(panel.id)
    });
    app.shell.disposed.connect(() => markers.dispose());

    return log;
  }
};

/**
 * Output-selection tracking and the human-handoff "Ask about..." commands.
 *
 * WebMCP cannot wake, notify, or interrupt an agent (see
 * `docs/agent-collaboration-roadmap.md`). This plugin only ever prepares
 * bounded context — a captured output selection — for an explicit human
 * handoff, and works exactly the same with no agent connected.
 */
const outputSelectionPlugin: JupyterFrontEndPlugin<OutputSelectionTracker> = {
  id: 'jupyterlite-webmcp:output-selection',
  description: 'Tracks output-text selections and the "Ask about..." handoff commands.',
  autoStart: true,
  requires: [INotebookTracker],
  provides: IOutputSelectionTracker,
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker): OutputSelectionTracker => {
    const outputSelection = new OutputSelectionTracker(tracker);
    app.shell.disposed.connect(() => outputSelection.dispose());

    registerAskAboutCommands({ app, tracker, outputSelection });

    const affordance = new AskAboutOutputAffordance(tracker, outputSelection);
    app.shell.disposed.connect(() => affordance.dispose());

    return outputSelection;
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
  optional: [IDefaultFileBrowser, IStatusBar, IActivityLog, IOutputSelectionTracker],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    docManager: IDocumentManager,
    review: ReviewStore,
    fileBrowser: IDefaultFileBrowser | null,
    statusBar: IStatusBar | null,
    activity: ActivityLog | null,
    outputSelection: OutputSelectionTracker | null
  ): void => {
    const env: IJupyterEnv = { app, docManager, tracker, fileBrowser };
    const registry = new WebMCPRegistry(activity ?? undefined);

    if (statusBar) {
      const item = new WebMCPStatus(registry, activity ?? undefined, tracker);
      statusBar.registerStatusItem('jupyterlite-webmcp:status', {
        item,
        align: 'right',
        rank: 100
      });
    }

    void app.started.then(() =>
      registry.register(buildTools(env, review, outputSelection ?? undefined))
    );
  }
};

export { ReviewCommandIDs, AccessCommandIDs, AskAboutCommandIDs, IReviewStore, IActivityLog, IOutputSelectionTracker };

export default [reviewPlugin, accessPlugin, activityPlugin, outputSelectionPlugin, webmcpPlugin];

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
import { registerAccessCommands, AccessCommandIDs } from './access/commands';
import { AccessMarkers } from './access/markers';
import { AccessOverview } from './access/overview';
import { ProvenanceTracker } from './access/provenance';
import { IJupyterEnv } from './jupyter/workspace';
import { registerReviewCommands, ReviewCommandIDs } from './review/commands';
import { ReviewMarkers } from './review/markers';
import { ReviewStore } from './review/storage';
import { OutputSelectionTracker } from './selection/capture';
import { IActivityLog, IOutputSelectionTracker, IReviewStore } from './tokens';
import { AskAboutCommandIDs, AskAboutOutputAffordance, registerAskAboutCommands } from './ui/askAbout';
import { WebMcpPanel } from './ui/panel';
import { WebMCPStatus } from './ui/status';
import { WebMCPRegistry } from './webmcp/register';
import { buildTools } from './webmcp/tools';

/**
 * Notebook review threads.
 *
 * Ordinary notebook functionality: create, reply to, resolve and navigate
 * comments anchored to cells, source ranges and outputs. No agent required.
 * Owns the store and the cosmetic per-cell markers; the Comments section
 * itself lives in the single Agent panel (`panelPlugin`, below), since
 * showing it requires the commands that need a panel to reveal.
 */
const reviewPlugin: JupyterFrontEndPlugin<ReviewStore> = {
  id: 'jupyterlite-webmcp:review',
  description: 'Threaded review comments stored in notebook metadata.',
  autoStart: true,
  requires: [INotebookTracker],
  provides: IReviewStore,
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker): ReviewStore => {
    const store = new ReviewStore(tracker);

    const markers = new ReviewMarkers(tracker, store);
    app.shell.disposed.connect(() => markers.dispose());

    return store;
  }
};

/**
 * Per-cell and per-notebook agent access control and provenance.
 *
 * Ordinary notebook functionality: the human decides, per cell and per
 * notebook, what a connected agent may do with it (write/read/none), and
 * every cell keeps a bounded, coalesced trail of who last changed it. All
 * of it works exactly the same with no agent connected: the commands, the
 * markers, and the human-edit provenance listener never touch
 * `document.modelContext`.
 */
const accessPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlite-webmcp:access',
  description:
    'Per-cell and per-notebook agent access control (write/read/none) and cell provenance history.',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    fileBrowser: IDefaultFileBrowser | null
  ): void => {
    registerAccessCommands({ app, tracker, fileBrowser });

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
 * exactly the same with or without it. Just the bounded, in-memory log
 * itself: the Activity section and the cell/output presence markers (which
 * need a panel to reveal) live in `panelPlugin`, below.
 */
const activityPlugin: JupyterFrontEndPlugin<ActivityLog> = {
  id: 'jupyterlite-webmcp:activity',
  description: 'A bounded, in-memory log of recent tool activity.',
  autoStart: true,
  provides: IActivityLog,
  activate: (): ActivityLog => new ActivityLog()
};

/**
 * The single right-sidebar Agent panel.
 *
 * Consolidates what used to be two separate sidebar panels (Review,
 * Activity) plus the only complete place to configure per-cell agent access
 * (Access) into one restrained, tabbed panel - see `src/ui/panel.tsx`. Also
 * registers the review commands and the activity presence markers, since
 * both need a panel to reveal.
 */
const panelPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlite-webmcp:panel',
  description:
    'The single right-sidebar Agent panel: activity, review comments and per-cell access, in one place.',
  autoStart: true,
  requires: [INotebookTracker, IReviewStore, IActivityLog],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    store: ReviewStore,
    log: ActivityLog,
    restorer: ILayoutRestorer | null
  ): void => {
    const access = new AccessOverview(tracker);
    app.shell.disposed.connect(() => access.dispose());

    const panel = new WebMcpPanel({ app, tracker, store, log, access });
    app.shell.add(panel, 'right', { rank: 900 });
    if (restorer) {
      restorer.add(panel, 'jupyterlite-webmcp-panel');
    }

    registerReviewCommands({
      app,
      tracker,
      store,
      reveal: () => {
        panel.activateTab('comments');
        app.shell.activateById(panel.id);
      }
    });

    const activityMarkers = new ActivityMarkers(tracker, log, {
      revealActivityPanel: () => {
        panel.activateTab('activity');
        app.shell.activateById(panel.id);
      }
    });
    app.shell.disposed.connect(() => activityMarkers.dispose());
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

export default [
  reviewPlugin,
  accessPlugin,
  activityPlugin,
  panelPlugin,
  outputSelectionPlugin,
  webmcpPlugin
];

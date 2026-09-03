/**
 * The single right-sidebar Agent panel: one place to see what a connected
 * agent did (Activity), read and reply to review threads (Comments), and
 * see and change what the agent may touch (Access). Replaces the separate
 * Review and Activity panels this extension used to register - restrained
 * sectioning via one small tab bar, in the same visual language as the
 * Comments filter row nested beneath it, rather than three front doors.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { LabIcon, ReactWidget } from '@jupyterlab/ui-components';
import { Signal } from '@lumino/signaling';
import * as React from 'react';

import { AccessOverview } from '../access/overview';
import { AccessSection } from '../access/panel';
import { ActivityLog } from '../activity/model';
import { ActivitySection } from '../activity/panel';
import { CommentsFilter, CommentsSection } from '../review/panel';
import { ReviewStore } from '../review/storage';

const panelIcon = new LabIcon({
  name: 'jupyterlite-webmcp:panel',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">' +
    '<circle class="jp-icon3" fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="8" r="4"/>' +
    '<path class="jp-icon3" fill="none" stroke="currentColor" stroke-width="2" ' +
    'd="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>' +
    '</svg>'
});

/** The panel's three sections, shown one at a time. */
export type PanelTab = 'activity' | 'comments' | 'access';

const TAB_LABELS: Record<PanelTab, string> = {
  activity: 'Activity',
  comments: 'Comments',
  access: 'Access'
};

/** Options accepted by the {@link WebMcpPanel} constructor. */
export interface IWebMcpPanelOptions {
  /** The application (kept for parity with other widgets; not used directly). */
  app: JupyterFrontEnd;
  /** Tracks the current notebook. */
  tracker: INotebookTracker;
  /** Where review threads are read from and written to. */
  store: ReviewStore;
  /** Where activity events are read from. */
  log: ActivityLog;
  /** Computes the per-cell access overview. */
  access: AccessOverview;
}

/**
 * A `ReactWidget` shown in the right sidebar, tabbing between the Activity,
 * Comments and Access sections for the notebook that is currently active.
 */
export class WebMcpPanel extends ReactWidget {
  constructor(options: IWebMcpPanelOptions) {
    super();
    this._app = options.app;
    this._tracker = options.tracker;
    this._store = options.store;
    this._log = options.log;
    this._access = options.access;

    this.id = 'jupyterlite-webmcp-panel';
    this.addClass('jp-webmcp-Panel');
    this.title.caption = 'Agent';
    this.title.label = '';
    this.title.icon = panelIcon;

    this._tracker.currentChanged.connect(this._scheduleUpdate, this);
    this._store.changed.connect(this._scheduleUpdate, this);
    this._log.changed.connect(this._scheduleUpdate, this);
    this._access.changed.connect(this._scheduleUpdate, this);
  }

  /** Switches to `tab`, re-rendering immediately. */
  activateTab(tab: PanelTab): void {
    this._tab = tab;
    this.update();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    Signal.disconnectReceiver(this);
    super.dispose();
  }

  render(): JSX.Element {
    return this._renderBody();
  }

  private _scheduleUpdate = (): void => {
    this.update();
  };

  private _setFilter = (filter: CommentsFilter): void => {
    this._filter = filter;
    this.update();
  };

  private _renderBody(): JSX.Element {
    const panel = this._tracker.currentWidget;
    return (
      <div className="jp-webmcp-Panel-body">
        <div className="jp-webmcp-header">
          <span>Agent</span>
          <span>{panel ? panel.context.path.split('/').pop() : 'No notebook open'}</span>
        </div>
        <div className="jp-webmcp-tabs" role="tablist">
          {(['activity', 'comments', 'access'] as PanelTab[]).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={this._tab === tab}
              className={'jp-webmcp-btn jp-webmcp-tab' + (this._tab === tab ? ' jp-mod-selected' : '')}
              onClick={() => this.activateTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div className="jp-webmcp-Panel-section">{this._renderSection()}</div>
      </div>
    );
  }

  private _renderSection(): JSX.Element {
    switch (this._tab) {
      case 'activity':
        return <ActivitySection tracker={this._tracker} log={this._log} />;
      case 'access':
        return <AccessSection tracker={this._tracker} overview={this._access} />;
      default:
        return (
          <CommentsSection
            tracker={this._tracker}
            store={this._store}
            filter={this._filter}
            onFilterChange={this._setFilter}
            onAddComment={() => {
              void this._app.commands.execute('jupyterlite-webmcp:add-comment');
            }}
          />
        );
    }
  }

  private _tab: PanelTab = 'activity';
  private _filter: CommentsFilter = 'open';
  private _app: JupyterFrontEnd;
  private _tracker: INotebookTracker;
  private _store: ReviewStore;
  private _log: ActivityLog;
  private _access: AccessOverview;
}

/**
 * The right-sidebar review panel: lists comment threads for the current
 * notebook, lets a human filter, navigate, reply, resolve and reopen them.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { InputDialog } from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { NotebookPanel, INotebookTracker } from '@jupyterlab/notebook';
import { LabIcon, ReactWidget, UseSignal } from '@jupyterlab/ui-components';
import * as React from 'react';

import { revealCell } from '../jupyter/focus';
import { HUMAN_AUTHOR, IThread } from './model';
import { ReviewStore } from './storage';

const reviewIcon = new LabIcon({
  name: 'jupyterlite-webmcp:review',
  svgstr:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">' +
    '<path class="jp-icon3" fill="none" stroke="currentColor" stroke-width="2" ' +
    'd="M3 5.5h18v10H8.5L4 20v-4.5H3z"/>' +
    '</svg>'
});

type Filter = 'open' | 'resolved' | 'all' | 'current-cell';

/** Options accepted by the {@link ReviewPanel} constructor. */
export interface IReviewPanelOptions {
  /** The application (kept for parity with other widgets; not used directly). */
  app: JupyterFrontEnd;
  /** Tracks the current notebook. */
  tracker: INotebookTracker;
  /** Where threads are read from and written to. */
  store: ReviewStore;
}

/**
 * A `ReactWidget` shown in the right sidebar, listing review comment
 * threads for the notebook that is currently active, with filtering and
 * per-thread reply/resolve controls.
 */
export class ReviewPanel extends ReactWidget {
  constructor(options: IReviewPanelOptions) {
    super();
    this._tracker = options.tracker;
    this._store = options.store;
    this.addClass('jp-webmcp-ReviewPanel');
    this.title.caption = 'Review';
    this.title.label = '';
    this.title.icon = reviewIcon;
  }

  render(): JSX.Element {
    return (
      <UseSignal signal={this._store.changed}>{() => this._renderBody()}</UseSignal>
    );
  }

  private _setFilter(filter: Filter): void {
    this._filter = filter;
    this.update();
  }

  private _renderBody(): JSX.Element {
    const panel = this._tracker.currentWidget;
    return (
      <div>
        <div className="jp-webmcp-header">
          <span>Review</span>
          <span>{panel ? panel.context.path.split('/').pop() : 'No notebook open'}</span>
        </div>
        <div className="jp-webmcp-filters">
          {this._renderFilterButton('open', 'Open')}
          {this._renderFilterButton('resolved', 'Resolved')}
          {this._renderFilterButton('all', 'All')}
          {this._renderFilterButton('current-cell', 'Current cell')}
        </div>
        {panel ? this._renderThreads(panel) : this._renderEmptyState('No notebook open.')}
      </div>
    );
  }

  private _renderFilterButton(filter: Filter, label: string): JSX.Element {
    const selected = this._filter === filter;
    return (
      <button
        key={filter}
        className={'jp-webmcp-btn' + (selected ? ' jp-mod-selected' : '')}
        onClick={() => this._setFilter(filter)}
      >
        {label}
      </button>
    );
  }

  private _renderEmptyState(message: string): JSX.Element {
    return <div className="jp-webmcp-empty">{message}</div>;
  }

  private _renderThreads(panel: NotebookPanel): JSX.Element {
    let threads: IThread[];
    let emptyMessage: string;

    if (this._filter === 'current-cell') {
      const cellId = panel.content.activeCell ? panel.content.activeCell.model.id : null;
      threads = cellId
        ? this._store.listThreads(panel, { status: 'all', cellId })
        : [];
      emptyMessage = 'No comments on the current cell.';
    } else {
      threads = this._store.listThreads(panel, { status: this._filter });
      emptyMessage =
        this._filter === 'resolved' ? 'No resolved comments.' : 'No open comments.';
    }

    if (threads.length === 0) {
      return this._renderEmptyState(emptyMessage);
    }

    return (
      <div className="jp-webmcp-threads">
        {threads.map(thread => this._renderThread(panel, thread))}
      </div>
    );
  }

  private _renderThread(panel: NotebookPanel, thread: IThread): JSX.Element {
    const anchorStatus = this._store.anchorStatus(panel, thread);
    const navigate = async (): Promise<void> => {
      try {
        if (anchorStatus.cellIndex === null) {
          return;
        }
        const cell = await revealCell(panel, anchorStatus.cellIndex);
        if (anchorStatus.range && cell && cell.editor) {
          cell.editor.focus();
          cell.editor.setSelection(anchorStatus.range as CodeEditor.IRange);
        }
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    };

    return (
      <div
        key={thread.id}
        className="jp-webmcp-thread"
        onClick={() => {
          void navigate();
        }}
      >
        <div className="jp-webmcp-thread-header">
          {'Cell ' + ((anchorStatus.cellIndex ?? -1) + 1) + ' · ' + thread.anchor.kind}
          {anchorStatus.state === 'orphaned' || anchorStatus.state === 'cell-missing' ? (
            <span className="jp-webmcp-orphan"> anchor lost</span>
          ) : null}
          {anchorStatus.outputChanged ? (
            <span className="jp-webmcp-changed"> output changed since this comment</span>
          ) : null}
        </div>
        {thread.anchor.kind === 'source-range' && thread.anchor.selectedText ? (
          <pre className="jp-webmcp-anchorText">
            {truncate(thread.anchor.selectedText, 120)}
          </pre>
        ) : null}
        {thread.messages.map(message => (
          <div key={message.id} className="jp-webmcp-message">
            <div className="jp-webmcp-author">
              {message.author.kind === 'human' ? 'You' : message.author.name || 'Browser agent'}
              {' · '}
              {new Date(message.createdAt).toLocaleString()}
            </div>
            <div className="jp-webmcp-body">{message.body}</div>
          </div>
        ))}
        <div className="jp-webmcp-actions">
          <button
            className="jp-webmcp-btn"
            onClick={event => {
              event.stopPropagation();
              void this._reply(panel, thread.id);
            }}
          >
            Reply
          </button>
          {thread.status === 'open' ? (
            <button
              className="jp-webmcp-btn"
              onClick={event => {
                event.stopPropagation();
                this._store.setStatus(panel, thread.id, 'resolved');
              }}
            >
              Resolve
            </button>
          ) : (
            <button
              className="jp-webmcp-btn"
              onClick={event => {
                event.stopPropagation();
                this._store.setStatus(panel, thread.id, 'open');
              }}
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    );
  }

  private async _reply(panel: NotebookPanel, threadId: string): Promise<void> {
    try {
      const result = await InputDialog.getText({
        title: 'Reply',
        placeholder: 'Reply'
      });
      if (!result.button.accept || !result.value || !result.value.trim()) {
        return;
      }
      this._store.reply(panel, threadId, result.value, HUMAN_AUTHOR);
    } catch (err) {
      console.warn('[jupyterlite-webmcp]', err);
    }
  }

  private _filter: Filter = 'open';
  private _tracker: INotebookTracker;
  private _store: ReviewStore;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

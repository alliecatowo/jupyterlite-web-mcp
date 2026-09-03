/**
 * The Agent panel's Comments section: lists review comment threads for the
 * current notebook, and lets a human filter, navigate, reply, resolve and
 * reopen them. A stateless renderer (`CommentsSection`) rather than its own
 * widget: the containing `WebMcpPanel` (`src/ui/panel.tsx`) owns the filter
 * state and re-renders this alongside the Activity and Access sections.
 */
import { InputDialog } from '@jupyterlab/apputils';
import { Cell } from '@jupyterlab/cells';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { NotebookPanel, INotebookTracker } from '@jupyterlab/notebook';
import * as React from 'react';

import { revealCell } from '../jupyter/focus';
import { makeSourceAnchor, positionAt } from './anchors';
import { HUMAN_AUTHOR, IThread } from './model';
import { ReviewStore } from './storage';

/**
 * Scrolls the output at `outputIndex` within a revealed cell into view and
 * briefly highlights it (SPEC §36: "scrolls output into view for output
 * comments"). Presentation only: nothing in the extension depends on this
 * having run.
 */
export function scrollOutputIntoView(cell: Cell | null, outputIndex: number | undefined): void {
  if (!cell || outputIndex === undefined || outputIndex < 0) {
    return;
  }
  const nodes = cell.node.querySelectorAll('.jp-OutputArea-child');
  const node = nodes[outputIndex] as HTMLElement | undefined;
  if (!node) {
    return;
  }
  node.scrollIntoView({ block: 'nearest' });
  node.classList.add('jp-webmcp-outputHighlight');
  setTimeout(() => node.classList.remove('jp-webmcp-outputHighlight'), 2000);
}

/** Which threads the Comments section shows. */
export type CommentsFilter = 'open' | 'resolved' | 'all' | 'current-cell';

/** Options accepted by {@link CommentsSection}. */
export interface ICommentsSectionProps {
  /** Tracks the current notebook. */
  tracker: INotebookTracker;
  /** Where threads are read from and written to. */
  store: ReviewStore;
  /** The active filter, owned by the containing panel. */
  filter: CommentsFilter;
  /** Called when the human picks a different filter. */
  onFilterChange: (filter: CommentsFilter) => void;
  /** Opens the ordinary human comment composer for the active selection or cell. */
  onAddComment: () => void;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

async function reply(store: ReviewStore, panel: NotebookPanel, threadId: string): Promise<void> {
  try {
    const result = await InputDialog.getText({
      title: 'Reply',
      placeholder: 'Reply'
    });
    if (!result.button.accept || !result.value || !result.value.trim()) {
      return;
    }
    store.reply(panel, threadId, result.value, HUMAN_AUTHOR);
  } catch (err) {
    console.warn('[jupyterlite-webmcp]', err);
  }
}

/**
 * Re-anchors an orphaned (or cell-missing) thread to the human's current
 * editor selection in the active cell (SPEC §41: "Allow manual re-anchoring
 * if reasonable."). If there is no non-empty selection right now, this is a
 * silent no-op - never a native `alert`.
 */
function reanchor(store: ReviewStore, panel: NotebookPanel, threadId: string): void {
  try {
    const cell = panel.content.activeCell;
    const editor = cell ? cell.editor : null;
    if (!cell || !editor) {
      return;
    }
    const selection = editor.getSelection();
    if (!selection) {
      return;
    }
    const startOffset = editor.getOffsetAt(selection.start);
    const endOffset = editor.getOffsetAt(selection.end);
    if (startOffset === endOffset) {
      return;
    }
    const source = cell.model.sharedModel.getSource();
    const lo = Math.min(startOffset, endOffset);
    const hi = Math.max(startOffset, endOffset);
    const range = { start: positionAt(source, lo), end: positionAt(source, hi) };
    const anchor = makeSourceAnchor(cell.model.id, source, range);
    store.reanchor(panel, threadId, anchor);
  } catch (err) {
    console.warn('[jupyterlite-webmcp]', err);
  }
}

function renderFilterButton(
  filter: CommentsFilter,
  label: string,
  active: CommentsFilter,
  onFilterChange: (filter: CommentsFilter) => void
): JSX.Element {
  return (
    <button
      key={filter}
      className={'jp-webmcp-btn' + (active === filter ? ' jp-mod-selected' : '')}
      onClick={() => onFilterChange(filter)}
    >
      {label}
    </button>
  );
}

function renderThread(store: ReviewStore, panel: NotebookPanel, thread: IThread): JSX.Element {
  const anchorStatus = store.anchorStatus(panel, thread);
  const navigate = async (): Promise<void> => {
    try {
      if (anchorStatus.cellIndex === null) {
        return;
      }
      const cell = await revealCell(panel, anchorStatus.cellIndex);
      if (anchorStatus.range && cell && cell.editor) {
        cell.editor.focus();
        cell.editor.setSelection(anchorStatus.range as CodeEditor.IRange);
      } else if (thread.anchor.kind === 'output') {
        scrollOutputIntoView(cell, anchorStatus.outputIndex);
      }
    } catch (err) {
      console.warn('[jupyterlite-webmcp]', err);
    }
  };

  return (
    <div
      key={thread.id}
      className="jp-webmcp-thread"
      role="button"
      tabIndex={0}
      onClick={() => {
        void navigate();
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void navigate();
        }
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
        <pre className="jp-webmcp-anchorText">{truncate(thread.anchor.selectedText, 120)}</pre>
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
            void reply(store, panel, thread.id);
          }}
        >
          Reply
        </button>
        {anchorStatus.state === 'orphaned' || anchorStatus.state === 'cell-missing' ? (
          <button
            className="jp-webmcp-btn"
            onClick={event => {
              event.stopPropagation();
              reanchor(store, panel, thread.id);
            }}
          >
            Re-anchor
          </button>
        ) : null}
        {thread.status === 'open' ? (
          <button
            className="jp-webmcp-btn"
            onClick={event => {
              event.stopPropagation();
              store.setStatus(panel, thread.id, 'resolved');
            }}
          >
            Resolve
          </button>
        ) : (
          <button
            className="jp-webmcp-btn"
            onClick={event => {
              event.stopPropagation();
              store.setStatus(panel, thread.id, 'open');
            }}
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

function renderThreads(store: ReviewStore, panel: NotebookPanel, filter: CommentsFilter): JSX.Element {
  let threads: IThread[];
  let emptyMessage: string;

  if (filter === 'current-cell') {
    const cellId = panel.content.activeCell ? panel.content.activeCell.model.id : null;
    threads = cellId ? store.listThreads(panel, { status: 'all', cellId }) : [];
    emptyMessage = 'No comments on the current cell.';
  } else {
    threads = store.listThreads(panel, { status: filter });
    emptyMessage = filter === 'resolved' ? 'No resolved comments.' : 'No open comments.';
  }

  if (threads.length === 0) {
    return <div className="jp-webmcp-empty">{emptyMessage}</div>;
  }

  return (
    <div className="jp-webmcp-threads">{threads.map(thread => renderThread(store, panel, thread))}</div>
  );
}

/**
 * Renders the Comments section body: the filter row plus either the
 * matching threads or an empty-state message. Reads `props.store` fresh on
 * every render, so the containing panel only needs to re-render this on
 * `store.changed` - it holds no state of its own beyond the filter, which
 * the panel owns.
 */
export function CommentsSection(props: ICommentsSectionProps): JSX.Element {
  const { tracker, store, filter, onFilterChange, onAddComment } = props;
  const panel = tracker.currentWidget;
  return (
    <div className="jp-webmcp-Comments">
      <button
        className="jp-webmcp-btn jp-webmcp-addComment"
        disabled={!panel || !panel.content.activeCell}
        title="Add a comment to the selected code, or to the current cell."
        onClick={onAddComment}
      >
        Add comment
      </button>
      <div className="jp-webmcp-commentHelp">
        Select code to comment on that range, or leave nothing selected to comment on the current cell.
      </div>
      <div className="jp-webmcp-filters">
        {renderFilterButton('open', 'Open', filter, onFilterChange)}
        {renderFilterButton('resolved', 'Resolved', filter, onFilterChange)}
        {renderFilterButton('all', 'All', filter, onFilterChange)}
        {renderFilterButton('current-cell', 'Current cell', filter, onFilterChange)}
      </div>
      {panel ? (
        renderThreads(store, panel, filter)
      ) : (
        <div className="jp-webmcp-empty">No notebook open.</div>
      )}
    </div>
  );
}

/**
 * Front-end commands that let a human create and open review comments from
 * the notebook UI: commands, a context menu, and (implicitly) whatever
 * keybindings a user's keymap chooses to bind to them (none are registered
 * here).
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { InputDialog } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';

import { makeSourceAnchor, positionAt } from './anchors';
import { HUMAN_AUTHOR, IAnchor } from './model';
import { ReviewStore } from './storage';

/**
 * Given the DOM node the context menu was invoked on, finds the enclosing
 * `.jp-OutputArea-child` (if any) and computes its zero-based index among
 * its siblings within the same `.jp-OutputArea` — the cosmetic-to-semantic
 * mapping SPEC §37/§42 requires so a comment anchors to the output the user
 * actually right-clicked, not always output 0.
 */
function outputIndexFromNode(node: Element | null): number | null {
  const child = node ? node.closest('.jp-OutputArea-child') : null;
  if (!child) {
    return null;
  }
  const area = child.closest('.jp-OutputArea');
  const siblings = area
    ? Array.from(area.querySelectorAll(':scope > .jp-OutputArea-child'))
    : [child];
  const index = siblings.indexOf(child);
  return index === -1 ? null : index;
}

/** Command ids contributed by this module. */
export namespace ReviewCommandIDs {
  /** Comment on the current selection, or the whole cell if nothing is selected. */
  export const addComment = 'jupyterlite-webmcp:add-comment';
  /** Always comment on the whole active cell. */
  export const addCellComment = 'jupyterlite-webmcp:add-cell-comment';
  /** Comment on the active cell's first output. */
  export const addOutputComment = 'jupyterlite-webmcp:add-output-comment';
  /** Reveal the review panel. */
  export const openReview = 'jupyterlite-webmcp:open-review';
}

/** Options accepted by {@link registerReviewCommands}. */
export interface IReviewCommandOptions {
  /** The application, used to register commands and context menu items. */
  app: JupyterFrontEnd;
  /** Tracks the current notebook and its active cell. */
  tracker: INotebookTracker;
  /** Where threads are read from and written to. */
  store: ReviewStore;
  /** Brings the review panel into view. */
  reveal: () => void;
}

function truncateLabel(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max) + '…' : collapsed;
}

/**
 * Registers the review comment commands (add-comment, add-cell-comment,
 * add-output-comment, open-review), plus matching context-menu entries on
 * cells and output areas. Every command body is wrapped so a failure is
 * logged rather than thrown back at the shell.
 */
export function registerReviewCommands(options: IReviewCommandOptions): void {
  const { app, tracker, store, reveal } = options;

  app.commands.addCommand(ReviewCommandIDs.addComment, {
    label: 'Add Comment',
    caption: 'Comment on the selected code, or on the whole cell.',
    isEnabled: () => !!tracker.currentWidget && !!tracker.currentWidget.content.activeCell,
    execute: async () => {
      try {
        const panel = tracker.currentWidget;
        const cell = panel ? panel.content.activeCell : null;
        if (!panel || !cell) {
          return;
        }
        const cellId = cell.model.id;
        const editor = cell.editor;
        let anchor: IAnchor;
        let label: string;

        const selection = editor ? editor.getSelection() : null;
        const startOffset = selection ? editor!.getOffsetAt(selection.start) : 0;
        const endOffset = selection ? editor!.getOffsetAt(selection.end) : 0;

        if (editor && selection && startOffset !== endOffset) {
          const source = cell.model.sharedModel.getSource();
          const lo = Math.min(startOffset, endOffset);
          const hi = Math.max(startOffset, endOffset);
          const range = { start: positionAt(source, lo), end: positionAt(source, hi) };
          anchor = makeSourceAnchor(cellId, source, range);
          label = truncateLabel(anchor.selectedText ?? '', 60);
        } else {
          anchor = { kind: 'cell', cellId };
          label = 'Cell ' + (panel.content.activeCellIndex + 1);
        }

        const result = await InputDialog.getText({
          title: 'Add comment',
          label,
          placeholder: 'Comment'
        });
        if (!result.button.accept || !result.value || !result.value.trim()) {
          return;
        }
        store.createThread(panel, anchor, result.value, HUMAN_AUTHOR);
        reveal();
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    }
  });

  app.commands.addCommand(ReviewCommandIDs.addCellComment, {
    label: 'Comment on Cell',
    caption: 'Comment on the whole cell.',
    isEnabled: () => !!tracker.currentWidget && !!tracker.currentWidget.content.activeCell,
    execute: async () => {
      try {
        const panel = tracker.currentWidget;
        const cell = panel ? panel.content.activeCell : null;
        if (!panel || !cell) {
          return;
        }
        const anchor: IAnchor = { kind: 'cell', cellId: cell.model.id };
        const label = 'Cell ' + (panel.content.activeCellIndex + 1);
        const result = await InputDialog.getText({
          title: 'Add comment',
          label,
          placeholder: 'Comment'
        });
        if (!result.button.accept || !result.value || !result.value.trim()) {
          return;
        }
        store.createThread(panel, anchor, result.value, HUMAN_AUTHOR);
        reveal();
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    }
  });

  app.commands.addCommand(ReviewCommandIDs.addOutputComment, {
    label: 'Comment on Output',
    caption: 'Comment on the output that was right-clicked.',
    isEnabled: () => {
      const panel = tracker.currentWidget;
      const cell = panel ? panel.content.activeCell : null;
      if (!cell || cell.model.type !== 'code') {
        return false;
      }
      const outputs = (cell.model.sharedModel.toJSON() as { outputs?: unknown[] }).outputs ?? [];
      return outputs.length > 0;
    },
    execute: async () => {
      try {
        const panel = tracker.currentWidget;
        const cell = panel ? panel.content.activeCell : null;
        if (!panel || !cell || cell.model.type !== 'code') {
          return;
        }
        const outputs = (cell.model.sharedModel.toJSON() as { outputs?: unknown[] }).outputs ?? [];
        if (outputs.length === 0) {
          return;
        }
        // The context-menu hit test tells us which output DOM node was
        // actually right-clicked (SPEC §37/§42): reading the DOM here is the
        // one cosmetic-to-semantic mapping the spec permits, and the index
        // it yields is still fully validated by ReviewStore below.
        const hit = app.contextMenuHitTest(
          node => node.classList.contains('jp-OutputArea-child')
        );
        let outputIndex = hit ? outputIndexFromNode(hit) : null;
        if (outputIndex === null) {
          // Invoked from somewhere other than the context menu (e.g. the
          // command palette): only fall back to output 0 when that is
          // unambiguous.
          if (outputs.length !== 1) {
            return;
          }
          outputIndex = 0;
        }
        const anchor: IAnchor = store.buildOutputAnchor(panel, cell.model.id, outputIndex);
        const label = 'Cell ' + (panel.content.activeCellIndex + 1);
        const result = await InputDialog.getText({
          title: 'Add comment',
          label,
          placeholder: 'Comment'
        });
        if (!result.button.accept || !result.value || !result.value.trim()) {
          return;
        }
        store.createThread(panel, anchor, result.value, HUMAN_AUTHOR);
        reveal();
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    }
  });

  app.commands.addCommand(ReviewCommandIDs.openReview, {
    label: 'Show Review Panel',
    caption: 'Show the review comments panel.',
    execute: () => {
      try {
        reveal();
      } catch (err) {
        console.warn('[jupyterlite-webmcp]', err);
      }
    }
  });

  app.contextMenu.addItem({
    command: ReviewCommandIDs.addComment,
    selector: '.jp-Notebook .jp-Cell',
    rank: 12
  });
  app.contextMenu.addItem({
    command: ReviewCommandIDs.addCellComment,
    selector: '.jp-Notebook .jp-Cell',
    rank: 13
  });
  app.contextMenu.addItem({
    command: ReviewCommandIDs.addOutputComment,
    selector: '.jp-Notebook .jp-OutputArea-child',
    rank: 11
  });
}

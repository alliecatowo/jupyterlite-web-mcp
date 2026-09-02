/**
 * The human-handoff affordances from `docs/agent-collaboration-roadmap.md`:
 * "Ask about selection" and "Ask about this output".
 *
 * WebMCP cannot wake, notify, or interrupt an agent — nothing here pretends
 * otherwise. Both commands below only ever (1) state plainly, in plain
 * language, exactly what context would be shared, and (2) make sure that
 * context is current (an editor selection is already live state the agent
 * can read via `jupyter_get_context`; an output selection is made current
 * on the {@link OutputSelectionTracker} these commands are handed). Neither
 * one calls, contacts, or queues anything for an agent.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IDisposable } from '@lumino/disposable';

import { readFocus } from '../jupyter/focus';
import { IOutputSelection, OutputSelectionTracker } from '../selection/capture';
import { Popover } from './popover';

/** Command ids registered by {@link registerAskAboutCommands}. */
export const AskAboutCommandIDs = {
  askAboutSelection: 'jupyterlite-webmcp:ask-about-selection',
  askAboutOutput: 'jupyterlite-webmcp:ask-about-output'
};

const MAX_PREVIEW_CHARS = 240;

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_PREVIEW_CHARS ? trimmed.slice(0, MAX_PREVIEW_CHARS - 1) + '…' : trimmed;
}

function renderExplanation(container: HTMLElement, heading: string, body: string, quoted: string): void {
  const title = document.createElement('div');
  title.className = 'jp-webmcp-Ask-heading';
  title.textContent = heading;
  container.appendChild(title);

  const explain = document.createElement('p');
  explain.className = 'jp-webmcp-Ask-body';
  explain.textContent = body;
  container.appendChild(explain);

  const quote = document.createElement('pre');
  quote.className = 'jp-webmcp-Ask-quote';
  quote.textContent = quoted;
  container.appendChild(quote);

  const note = document.createElement('p');
  note.className = 'jp-webmcp-Ask-note';
  note.textContent =
    'This only prepares that context — it cannot open, notify, or otherwise contact an agent. ' +
    'Ask the agent about it yourself once you are ready.';
  container.appendChild(note);
}

function findOutputWrapper(panel: NotebookPanel, cellId: string, outputIndex: number): HTMLElement | null {
  const widgets = panel.content.widgets;
  for (let i = 0; i < widgets.length; i++) {
    const widget = widgets[i];
    if (widget.isDisposed || widget.model.id !== cellId) {
      continue;
    }
    try {
      const nodes = widget.node.querySelectorAll('.jp-OutputArea-child');
      return (nodes[outputIndex] as HTMLElement) ?? widget.node;
    } catch {
      return widget.node;
    }
  }
  return null;
}

/** Options accepted by {@link registerAskAboutCommands}. */
export interface IAskAboutOptions {
  app: JupyterFrontEnd;
  tracker: INotebookTracker;
  outputSelection: OutputSelectionTracker;
}

/**
 * Registers the two "Ask about..." commands as ordinary Jupyter commands.
 * Both work with no agent connected: they only show what would be shared.
 */
export function registerAskAboutCommands(options: IAskAboutOptions): void {
  const { app, tracker, outputSelection } = options;

  app.commands.addCommand(AskAboutCommandIDs.askAboutSelection, {
    label: 'Ask About Selection',
    caption: 'Show exactly what code selection would be shared if you asked the agent about it.',
    isEnabled: () => {
      const panel = tracker.currentWidget;
      return !!panel && !!readFocus(panel).textSelection;
    },
    execute: () => {
      const panel = tracker.currentWidget;
      if (!panel) {
        return;
      }
      const focus = readFocus(panel);
      const selection = focus.textSelection;
      if (!selection) {
        return;
      }
      const activeCell = panel.content.activeCell;
      const anchor = (activeCell && activeCell.node) || panel.node;
      Popover.open({
        anchor,
        ariaLabel: 'Ask about this selection',
        className: 'jp-webmcp-Ask-Popover',
        render: (container, close) => {
          const label =
            focus.activeCellIndex === null ? 'the active cell' : `cell ${focus.activeCellIndex + 1}`;
          renderExplanation(
            container,
            'Ask about this selection',
            `The agent would be shown your selected text from ${label}:`,
            preview(selection.text)
          );
          const button = document.createElement('button');
          button.className = 'jp-webmcp-btn jp-webmcp-Ask-close';
          button.textContent = 'Got it';
          button.onclick = close;
          container.appendChild(button);
        }
      });
    }
  });

  app.commands.addCommand(AskAboutCommandIDs.askAboutOutput, {
    label: 'Ask About This Output',
    caption: 'Show exactly what output text would be shared if you asked the agent about it.',
    isEnabled: () => !!outputSelection.current,
    execute: () => {
      const current = outputSelection.current;
      const panel = tracker.currentWidget;
      if (!current || !panel) {
        return;
      }
      const anchor = findOutputWrapper(panel, current.cellId, current.outputIndex) || panel.node;
      openOutputPopover(anchor, current, outputSelection);
    }
  });
}

function openOutputPopover(
  anchor: HTMLElement,
  selection: IOutputSelection,
  tracker: OutputSelectionTracker
): void {
  Popover.open({
    anchor,
    ariaLabel: 'Ask about this output',
    className: 'jp-webmcp-Ask-Popover',
    render: (container, close) => {
      renderExplanation(
        container,
        'Ask about this output',
        `The agent would be shown this selected output text (output ${selection.outputIndex + 1}):`,
        preview(selection.text)
      );
      const row = document.createElement('div');
      row.className = 'jp-webmcp-actions';

      const okButton = document.createElement('button');
      okButton.className = 'jp-webmcp-btn jp-webmcp-Ask-close';
      okButton.textContent = 'Got it';
      okButton.onclick = close;
      row.appendChild(okButton);

      const clearButton = document.createElement('button');
      clearButton.className = 'jp-webmcp-btn';
      clearButton.textContent = 'Clear selection';
      clearButton.onclick = () => {
        tracker.clear();
        close();
      };
      row.appendChild(clearButton);

      container.appendChild(row);
    }
  });
}

/**
 * Shows a small, ambient "Ask about this output" chip near the human's
 * current output selection (SPEC: "show a small Ask about this output
 * control near it, using your popover primitive"), and hides it again once
 * the selection is gone. The chip's own explanation popover is the same
 * {@link openOutputPopover} the command above uses.
 */
export class AskAboutOutputAffordance implements IDisposable {
  constructor(tracker: INotebookTracker, outputSelection: OutputSelectionTracker) {
    this._tracker = tracker;
    this._outputSelection = outputSelection;
    outputSelection.changed.connect(this._onChanged, this);
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    if (this._debounce !== null) {
      clearTimeout(this._debounce);
      this._debounce = null;
    }
    this._closePopover();
  }

  private _onChanged = (): void => {
    if (this._isDisposed) {
      return;
    }
    // Selection changes fire continuously while the human is still
    // dragging a selection; debounce so the chip appears once things
    // settle instead of flickering open/closed on every intermediate
    // selection state.
    if (this._debounce !== null) {
      clearTimeout(this._debounce);
    }
    this._debounce = setTimeout(() => {
      this._debounce = null;
      if (this._isDisposed) {
        return;
      }
      try {
        this._sync();
      } catch {
        // Presentation only.
      }
    }, 250);
  };

  private _sync(): void {
    const current = this._outputSelection.current;
    if (!current) {
      this._shownFor = null;
      this._closePopover();
      return;
    }
    if (
      this._shownFor &&
      this._shownFor.cellId === current.cellId &&
      this._shownFor.outputIndex === current.outputIndex &&
      this._shownFor.text === current.text
    ) {
      return; // Already showing the affordance for this exact selection.
    }
    const panel = this._tracker.currentWidget;
    if (!panel) {
      return;
    }
    const anchor = findOutputWrapper(panel, current.cellId, current.outputIndex);
    if (!anchor) {
      return;
    }
    this._shownFor = current;
    this._closePopover();
    this._popover = Popover.open({
      anchor,
      ariaLabel: 'Ask about this output',
      className: 'jp-webmcp-AskChip-Popover',
      autoFocus: false,
      onClose: () => {
        if (this._popover && this._popover.isDisposed) {
          this._popover = null;
        }
      },
      render: container => {
        const button = document.createElement('button');
        button.className = 'jp-webmcp-AskChip';
        button.textContent = 'Ask about this output';
        button.onclick = () => {
          this._closePopover();
          if (anchor) {
            openOutputPopover(anchor, current, this._outputSelection);
          }
        };
        container.appendChild(button);
      }
    });
  }

  private _closePopover(): void {
    if (this._popover && !this._popover.isDisposed) {
      this._popover.dispose();
    }
    this._popover = null;
  }

  private _isDisposed = false;
  private _shownFor: IOutputSelection | null = null;
  private _popover: Popover | null = null;
  private _debounce: ReturnType<typeof setTimeout> | null = null;
  private _tracker: INotebookTracker;
  private _outputSelection: OutputSelectionTracker;
}

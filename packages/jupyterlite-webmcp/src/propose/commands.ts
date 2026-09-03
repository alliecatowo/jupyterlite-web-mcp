/**
 * Commands for the human-only Direct/Propose mode toggle. Registered as
 * ordinary JupyterLab commands (reachable from the command palette and,
 * deliberately, from a Playwright test the same way an agent-blind keyboard
 * user would reach it) in addition to the panel header's own button
 * (`src/ui/panel.tsx`) — mirroring how `src/access/commands.ts` registers
 * `cycle-cell-access` alongside its context-menu entry.
 *
 * No WebMCP tool can execute either command: exactly like per-cell access,
 * the mode is set by the human, never by the agent.
 */
import { JupyterFrontEnd } from '@jupyterlab/application';

import { ProposeMode, ProposeStore } from './store';

/** Command ids contributed by this module. */
export namespace ProposeCommandIDs {
  /** Switch between Direct and Propose mode. */
  export const toggleMode = 'jupyterlite-webmcp:toggle-propose-mode';
  /** Set the mode explicitly, via `{ mode: 'direct' | 'propose' }`. */
  export const setMode = 'jupyterlite-webmcp:set-propose-mode';
}

/** Registers {@link ProposeCommandIDs.toggleMode} and {@link ProposeCommandIDs.setMode}. */
export function registerProposeCommands(app: JupyterFrontEnd, store: ProposeStore): void {
  app.commands.addCommand(ProposeCommandIDs.toggleMode, {
    label: () => (store.mode === 'propose' ? 'Agent Mode: Propose' : 'Agent Mode: Direct'),
    caption:
      'Toggle whether mutating agent tool calls apply immediately (Direct) or wait for you to accept or deny them inline (Propose).',
    execute: () => store.toggleMode()
  });

  app.commands.addCommand(ProposeCommandIDs.setMode, {
    label: 'Agent Mode: Set…',
    execute: args => {
      const mode = args.mode as ProposeMode;
      if (mode !== 'direct' && mode !== 'propose') {
        return;
      }
      store.setMode(mode);
    }
  });
}

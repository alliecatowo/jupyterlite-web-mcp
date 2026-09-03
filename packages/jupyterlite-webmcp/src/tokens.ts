import { Token } from '@lumino/coreutils';

import { ActivityLog } from './activity/model';
import { ProposeStore } from './propose/store';
import { OutputSelectionTracker } from './selection/capture';
import { ReviewStore } from './review/storage';

/**
 * Token for the notebook review store.
 *
 * The review feature stands on its own: it is provided by its own plugin and
 * works whether or not this browser supports WebMCP.
 */
export const IReviewStore = new Token<ReviewStore>(
  'jupyterlite-webmcp:IReviewStore',
  'Notebook review threads stored in notebook metadata.'
);

/**
 * Token for the presence / activity log.
 *
 * The activity layer stands on its own, exactly like the review store: it is
 * provided by its own plugin, and the tools plugin takes it only as an
 * optional dependency so the WebMCP tools still work without it.
 */
export const IActivityLog = new Token<ActivityLog>(
  'jupyterlite-webmcp:IActivityLog',
  'A bounded, in-memory log of recent tool activity, used to drive notebook presence.'
);

/**
 * Token for the output-selection tracker.
 *
 * Tracks the human's current in-output text selection so an explicit
 * "Ask about this output" handoff (and, when connected, the
 * `jupyter_get_output_selection` tool) can see exactly what the human means.
 * The tools plugin takes it only as an optional dependency, exactly like
 * {@link IActivityLog}, so WebMCP tools still work without it.
 */
export const IOutputSelectionTracker = new Token<OutputSelectionTracker>(
  'jupyterlite-webmcp:IOutputSelectionTracker',
  'Tracks a bounded, precisely-scoped selection inside one notebook output.'
);

/**
 * Token for the Propose/Deny mode store.
 *
 * Holds the human-only Direct/Propose toggle and the pending-proposal state
 * machine (`src/propose/store.ts`). Stands on its own, exactly like
 * {@link IActivityLog}: provided by its own plugin, and the tools plugin
 * reads it to decide whether `jupyter_update_cell` applies immediately or
 * stages a reviewable proposal.
 */
export const IProposeStore = new Token<ProposeStore>(
  'jupyterlite-webmcp:IProposeStore',
  'Propose/Deny mode: the Direct/Propose toggle and the pending-proposal state machine.'
);

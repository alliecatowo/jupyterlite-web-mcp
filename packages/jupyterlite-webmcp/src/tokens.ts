import { Token } from '@lumino/coreutils';

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

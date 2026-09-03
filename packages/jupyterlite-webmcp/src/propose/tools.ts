/**
 * Propose-mode orchestration for `jupyter_update_cell`.
 *
 * Direct mode calls `updateCell` (`src/jupyter/cells.ts`) straight away, as
 * it always has. Propose mode calls {@link proposeUpdateCell} instead: it
 * validates the write exactly the way Direct mode would (same access check,
 * same `sourceHash` freshness check, via the shared `resolveWritableCell`),
 * then creates a pending proposal and *waits* for the human to accept or
 * deny it in the notebook UI (`src/propose/markers.ts`) before the tool
 * call's promise resolves at all.
 *
 * Accepting calls `updateCell` — the exact function Direct mode uses — so
 * there is exactly one code path that ever mutates a cell's source.
 */
import { INotebookInfo } from '../jupyter/notebook';
import { resolveNotebook } from '../jupyter/notebook';
import { ICellSnapshot, resolveWritableCell, updateCell } from '../jupyter/cells';
import { toolError } from '../jupyter/errors';
import { IJupyterEnv } from '../jupyter/workspace';
import { ProposalAlreadyPendingError, ProposeStore } from './store';

export interface IProposeUpdateCellParams {
  notebookPath?: string | null;
  cellId: string;
  source: string;
  expectedSourceHash: string;
}

/** Result when the human accepted the proposal: identical shape to Direct mode's `updateCell` result, plus the proposal id. */
export interface IProposalAccepted {
  status: 'accepted';
  proposalId: string;
  notebook: INotebookInfo;
  cell: ICellSnapshot;
}

/**
 * Result when the human denied the proposal. Deliberately **not** thrown as
 * a tool error: this is a structured, non-error result (`isError` stays
 * unset), so the agent's next turn sees a normal success whose payload says
 * *why* the human said no, instead of parsing an error path for something
 * that was a legitimate, expected outcome.
 */
export interface IProposalDenied {
  status: 'denied';
  code: 'PROPOSAL_DENIED';
  proposalId: string;
  cellId: string;
  /** The human's reason, when they gave one; `null` otherwise. */
  reason: string | null;
}

export async function proposeUpdateCell(
  env: IJupyterEnv,
  proposals: ProposeStore,
  params: IProposeUpdateCellParams,
  signal?: AbortSignal
): Promise<IProposalAccepted | IProposalDenied> {
  if (typeof params.source !== 'string') {
    throw toolError('INVALID_ARGUMENT', 'source must be a string.');
  }

  const panel = await resolveNotebook(env, params.notebookPath, { intent: 'write' });

  // Validate up front — same access check and sourceHash freshness check
  // Direct mode's `updateCell` runs — so a write that could never succeed
  // (bad id, read-only cell, stale hash) fails immediately with the usual
  // structured error instead of first sitting in front of the human as a
  // proposal that can never be accepted.
  const { cell } = resolveWritableCell(panel, params.cellId, params.expectedSourceHash);
  const before = cell.sharedModel.getSource();

  let created;
  try {
    created = proposals.propose(
      { notebookPath: panel.context.path, cellId: params.cellId },
      {
        before,
        after: params.source,
        expectedSourceHash: params.expectedSourceHash,
        tool: 'jupyter_update_cell'
      },
      signal
    );
  } catch (err) {
    if (err instanceof ProposalAlreadyPendingError) {
      throw toolError('PROPOSAL_ALREADY_PENDING', err.message, {
        cellId: params.cellId,
        existingProposalId: err.existing.id
      });
    }
    throw err;
  }

  const { proposal, decision } = created;

  // Waits here until the human clicks Accept/Deny in the notebook UI, or
  // `signal` aborts — genuinely blocking the WebMCP `execute()` Promise, per
  // the propose/deny design (see `docs/propose-mode.md`). A fired `signal`
  // makes `decision` reject with a `toolError('ABORTED', ...)` (see
  // `ProposeStore.propose`), which propagates out of this function exactly
  // like an aborted `jupyter_run_cells` call does.
  const outcome = await decision;

  if (outcome.status === 'denied') {
    return {
      status: 'denied',
      code: 'PROPOSAL_DENIED',
      proposalId: proposal.id,
      cellId: params.cellId,
      reason: outcome.reason ?? null
    };
  }

  // Accepted: apply through the exact same path Direct mode uses. Targeted
  // by `proposal.notebookPath` — the concrete workspace-relative path
  // captured when the proposal was created — rather than re-resolving "the
  // current notebook" a second time: the human may have switched notebooks
  // while this proposal sat pending, and accept must land on the notebook
  // the diff was actually shown against, not whatever happens to be active
  // now. The sourceHash is re-checked inside `updateCell` regardless —
  // plenty of real time may have passed while the proposal was pending, so
  // an accept can never resurrect a write over a human edit made in the
  // meantime. A mismatch here surfaces as the same STALE_CELL an agent
  // already knows how to handle, not a special propose-mode error.
  const applied = await updateCell(env, {
    notebookPath: proposal.notebookPath,
    cellId: params.cellId,
    source: params.source,
    expectedSourceHash: params.expectedSourceHash
  });

  return { status: 'accepted', proposalId: proposal.id, ...applied };
}

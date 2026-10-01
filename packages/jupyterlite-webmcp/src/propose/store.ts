/**
 * Propose/Deny mode: the fourth thing a human can let an agent do with a
 * mutating tool, alongside the existing per-cell `write`/`read`/`none`
 * access levels (`src/access/guard.ts`).
 *
 * README's "What is deliberately not built" section named the missing piece
 * precisely: "the natural fourth level is a `propose` access where a write
 * lands as a staged edit the human accepts or rejects ... the diff
 * rendering it would need already exists (that is the `±N changed`
 * popover), but the staging semantics ... are real design work." This
 * module is that design, scoped to `jupyter_update_cell` first (see
 * `docs/propose-mode.md`).
 *
 * Two things live here, in one small in-memory store, on purpose:
 *
 * 1. The **mode** (`'direct'` | `'propose'`) — a human-only toggle, exactly
 *    like per-cell access: no WebMCP tool can read or change it.
 * 2. The **proposal state machine** — at most one pending proposal per cell
 *    (`propose()` throws {@link ProposalAlreadyPendingError} for a second
 *    one; see `docs/propose-mode.md` for why this rejects rather than
 *    queuing), each with a `decision` promise that settles only when the
 *    human calls {@link ProposeStore.accept} or {@link ProposeStore.deny},
 *    or the caller's `AbortSignal` fires, or the proposal becomes
 *    unreviewable (its cell or notebook is gone) and is auto-denied via
 *    {@link ProposeStore.autoDeny} (see `src/propose/lifecycle.ts`).
 *
 * Deliberately **not** persisted in notebook metadata like review threads:
 * a pending proposal is mid-flight tool-call state, not a durable record —
 * once accepted it becomes an ordinary cell edit (with its own provenance
 * history entry), and once denied or aborted there is nothing left to keep.
 * Reloading the page — like aborting — cleanly drops any pending proposal.
 */
import { ISignal, Signal } from '@lumino/signaling';

import { toolError } from '../jupyter/errors';

/** Direct mode applies a mutating tool call immediately, as it always has. */
export type ProposeMode = 'direct' | 'propose';

/** Where a proposal targets: one cell of one notebook. */
export interface IProposalTarget {
  /** Workspace-relative notebook path. */
  notebookPath: string;
  /** Stable nbformat cell id. */
  cellId: string;
}

/**
 * Terminal or in-flight state of one proposal. `'failed'` means the human
 * accepted it but applying the write then failed (for example the cell
 * changed while the proposal was pending, so the tool call returned
 * `STALE_CELL`): the change was never made.
 */
export type ProposalStatus = 'pending' | 'accepted' | 'denied' | 'aborted' | 'failed';

/** A pending or resolved proposed edit. */
export interface IProposal extends IProposalTarget {
  /** Unique id for this proposal. */
  id: string;
  /** The WebMCP tool this proposal was created for, e.g. `jupyter_update_cell`. */
  tool: string;
  /** Cell source before the proposed change. */
  before: string;
  /** Cell source the proposal would write if accepted. */
  after: string;
  /** The sourceHash the agent read before proposing; re-checked on accept. */
  expectedSourceHash: string;
  /** Current status. */
  status: ProposalStatus;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of accept/deny/abort, when settled. */
  resolvedAt?: string;
  /** The human's reason for denying, when given and when denied. */
  denyReason?: string;
  /** The tool error code the apply failed with, when `'failed'`. */
  failureCode?: string;
}

/** What {@link ProposeStore.propose}'s returned `decision` promise resolves to. */
export type IProposalDecision =
  | { status: 'accepted' }
  | { status: 'denied'; reason?: string };

/** Thrown by {@link ProposeStore.propose} when the target cell already has a pending proposal. */
export class ProposalAlreadyPendingError extends Error {
  constructor(readonly existing: IProposal) {
    super(
      `Cell "${existing.cellId}" already has a pending proposal (${existing.id}). ` +
        'Wait for the human to accept or deny it before proposing another change to the same cell.'
    );
    this.name = 'ProposalAlreadyPendingError';
  }
}

function targetKey(target: IProposalTarget): string {
  return `${target.notebookPath}\u0000${target.cellId}`;
}

/**
 * How many *settled* proposals are kept (newest first) after they resolve.
 * Pending proposals are never evicted, whatever their number: dropping one
 * would leave its tool call waiting on a decision no UI can make. Each entry
 * holds full before/after sources (up to `MAX_CELL_SOURCE_WRITE_BYTES`
 * each), so this stays small.
 */
export const MAX_SETTLED_PROPOSALS = 20;

/**
 * Maximum UTF-8 byte length of a deny reason handed back to the agent. The
 * banner's input and {@link ProposeStore.deny} both apply it.
 */
export const MAX_DENY_REASON_BYTES = 2 * 1024;

/**
 * Truncates `text` to at most `maxBytes` UTF-8 bytes without splitting a
 * code point (so never half a surrogate pair).
 */
export function truncateUtf8(text: string, maxBytes: number = MAX_DENY_REASON_BYTES): string {
  let bytes = 0;
  let end = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + size > maxBytes) {
      break;
    }
    bytes += size;
    end += ch.length;
  }
  return end === text.length ? text : text.slice(0, end);
}

export class ProposeStore {
  /** Emitted whenever the mode changes, or a proposal is created/settled. */
  get changed(): ISignal<ProposeStore, void> {
    return this._changed;
  }

  /** `'direct'` (default) or `'propose'`. */
  get mode(): ProposeMode {
    return this._mode;
  }

  /** Sets the mode. Human-only: no WebMCP tool calls this. */
  setMode(mode: ProposeMode): void {
    if (mode === this._mode) {
      return;
    }
    this._mode = mode;
    this._changed.emit();
  }

  /** Switches between `'direct'` and `'propose'`. */
  toggleMode(): void {
    this.setMode(this._mode === 'direct' ? 'propose' : 'direct');
  }

  /**
   * Every pending proposal plus the last {@link MAX_SETTLED_PROPOSALS}
   * settled ones, newest first.
   */
  get proposals(): readonly IProposal[] {
    return this._proposals;
  }

  /** Every pending proposal, newest first. Never truncated. */
  get pending(): readonly IProposal[] {
    return this._proposals.filter(p => p.status === 'pending');
  }

  /** The pending proposal for `target`, if any. */
  pendingFor(target: IProposalTarget): IProposal | null {
    const id = this._pendingByTarget.get(targetKey(target));
    return id ? (this._byId.get(id) ?? null) : null;
  }

  /**
   * Creates a pending proposal for `target` and returns it alongside a
   * `decision` promise that settles once the human accepts or denies it.
   *
   * Throws {@link ProposalAlreadyPendingError} synchronously (never as a
   * rejected promise) when `target`'s cell already has one pending — the
   * caller (`src/propose/tools.ts`) turns that into the structured
   * `PROPOSAL_ALREADY_PENDING` tool error.
   *
   * When `signal` is provided and fires before a decision is made, the
   * proposal is marked `'aborted'`, removed as the cell's pending proposal,
   * and `decision` rejects with a `ToolError` coded `ABORTED` — the same
   * shape `jupyter_run_cells` already produces for an aborted invocation
   * (`src/jupyter/errors.ts#isAbortError`), so the caller does not need a
   * second abort-handling code path.
   */
  propose(
    target: IProposalTarget,
    params: { before: string; after: string; expectedSourceHash: string; tool: string },
    signal?: AbortSignal
  ): { proposal: IProposal; decision: Promise<IProposalDecision> } {
    const existing = this.pendingFor(target);
    if (existing) {
      throw new ProposalAlreadyPendingError(existing);
    }

    const id = `proposal-${++this._seq}`;
    const proposal: IProposal = {
      id,
      notebookPath: target.notebookPath,
      cellId: target.cellId,
      tool: params.tool,
      before: params.before,
      after: params.after,
      expectedSourceHash: params.expectedSourceHash,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    this._byId.set(id, proposal);
    this._pendingByTarget.set(targetKey(target), id);
    this._proposals = [proposal, ...this._proposals];
    this._trim();

    const decision = new Promise<IProposalDecision>((resolve, reject) => {
      this._waits.set(id, { resolve, reject });
      if (!signal) {
        return;
      }
      if (signal.aborted) {
        this._abort(id);
        return;
      }
      const onAbort = (): void => this._abort(id);
      signal.addEventListener('abort', onAbort, { once: true });
      this._abortDetach.set(id, () => signal.removeEventListener('abort', onAbort));
    });

    this._changed.emit();
    return { proposal, decision };
  }

  /**
   * Accepts a pending proposal, settling its `decision` promise with
   * `{ status: 'accepted' }`. The caller (`src/propose/tools.ts`) is
   * responsible for actually applying the change through `updateCell` —
   * this store only tracks the decision, so there remains exactly one apply
   * code path regardless of mode.
   */
  accept(id: string): IProposal {
    return this._settle(id, 'accepted', proposal => {
      this._waits.get(proposal.id)?.resolve({ status: 'accepted' });
    });
  }

  /**
   * Denies a pending proposal with an optional human-supplied `reason`,
   * settling its `decision` promise with `{ status: 'denied', reason }` so
   * the agent's next turn can see why, not just that it was denied.
   */
  deny(id: string, reason?: string): IProposal {
    const bounded = reason === undefined ? undefined : truncateUtf8(reason);
    return this._settle(
      id,
      'denied',
      proposal => {
        this._waits.get(proposal.id)?.resolve({ status: 'denied', reason: bounded });
      },
      bounded
    );
  }

  /**
   * Denies `id` on the human's behalf because it can no longer be reviewed
   * (its cell was deleted, its notebook closed or renamed). Settles the tool
   * call with the same non-error `PROPOSAL_DENIED` result a human deny
   * gives, carrying `reason`. Returns `false` (and does nothing) when the
   * proposal is unknown or already settled, so it is safe to race with a
   * human click or an abort.
   */
  autoDeny(id: string, reason: string): boolean {
    const proposal = this._byId.get(id);
    if (!proposal || proposal.status !== 'pending') {
      return false;
    }
    this.deny(id, reason);
    return true;
  }

  /**
   * Records that an accepted proposal could not be applied (`code` is the
   * tool error the call returned, e.g. `STALE_CELL`), so the store never
   * reports as accepted a change that was not made. Returns `false` (and
   * does nothing) unless `id` is a known, accepted proposal.
   */
  markFailed(id: string, code: string): boolean {
    const proposal = this._byId.get(id);
    if (!proposal || proposal.status !== 'accepted') {
      return false;
    }
    proposal.status = 'failed';
    proposal.failureCode = code;
    this._changed.emit();
    return true;
  }

  private _settle(
    id: string,
    status: 'accepted' | 'denied',
    settle: (proposal: IProposal) => void,
    denyReason?: string
  ): IProposal {
    const proposal = this._byId.get(id);
    if (!proposal) {
      throw new Error(`Unknown proposal "${id}".`);
    }
    if (proposal.status !== 'pending') {
      throw new Error(`Proposal "${id}" is already ${proposal.status}.`);
    }
    proposal.status = status;
    proposal.resolvedAt = new Date().toISOString();
    if (denyReason) {
      proposal.denyReason = denyReason;
    }
    this._clearPending(proposal);
    settle(proposal);
    this._cleanupWait(id);
    this._trim();
    this._changed.emit();
    return proposal;
  }

  private _abort(id: string): void {
    const proposal = this._byId.get(id);
    if (!proposal || proposal.status !== 'pending') {
      return;
    }
    proposal.status = 'aborted';
    proposal.resolvedAt = new Date().toISOString();
    this._clearPending(proposal);
    this._waits
      .get(id)
      ?.reject(toolError('ABORTED', 'The proposal was aborted before a decision was made.', { proposalId: id }));
    this._cleanupWait(id);
    this._trim();
    this._changed.emit();
  }

  /** Keeps every pending proposal and the newest settled ones; forgets the rest. */
  private _trim(): void {
    let settled = 0;
    this._proposals = this._proposals.filter(p => {
      if (p.status === 'pending') {
        return true;
      }
      if (settled < MAX_SETTLED_PROPOSALS) {
        settled++;
        return true;
      }
      this._byId.delete(p.id);
      return false;
    });
  }

  private _clearPending(proposal: IProposal): void {
    const key = targetKey(proposal);
    if (this._pendingByTarget.get(key) === proposal.id) {
      this._pendingByTarget.delete(key);
    }
  }

  private _cleanupWait(id: string): void {
    this._waits.delete(id);
    const detach = this._abortDetach.get(id);
    if (detach) {
      detach();
      this._abortDetach.delete(id);
    }
  }

  private _mode: ProposeMode = 'direct';
  private _seq = 0;
  private _proposals: IProposal[] = [];
  private _byId = new Map<string, IProposal>();
  private _pendingByTarget = new Map<string, string>();
  private _waits = new Map<
    string,
    { resolve: (decision: IProposalDecision) => void; reject: (err: unknown) => void }
  >();
  private _abortDetach = new Map<string, () => void>();
  private _changed = new Signal<ProposeStore, void>(this);
}

/**
 * `src/propose/store.ts` has no JupyterLab dependency at all — it is a pure
 * state machine — so these tests exercise it directly with no mocking.
 */
import { ToolError } from '../../src/jupyter/errors';
import {
  IProposalDecision,
  ProposalAlreadyPendingError,
  ProposeStore
} from '../../src/propose/store';

function target(cellId = 'cell-1', notebookPath = '/nb.ipynb') {
  return { notebookPath, cellId };
}

describe('ProposeStore mode', () => {
  it('defaults to direct mode', () => {
    const store = new ProposeStore();
    expect(store.mode).toBe('direct');
  });

  it('setMode changes the mode and emits changed', () => {
    const store = new ProposeStore();
    let changes = 0;
    store.changed.connect(() => changes++);

    store.setMode('propose');
    expect(store.mode).toBe('propose');
    expect(changes).toBe(1);

    // Setting the same mode again is a no-op: no extra emission.
    store.setMode('propose');
    expect(changes).toBe(1);
  });

  it('toggleMode flips between direct and propose', () => {
    const store = new ProposeStore();
    store.toggleMode();
    expect(store.mode).toBe('propose');
    store.toggleMode();
    expect(store.mode).toBe('direct');
  });
});

describe('ProposeStore.propose', () => {
  it('creates a pending proposal visible via pendingFor and proposals', () => {
    const store = new ProposeStore();
    const { proposal } = store.propose(target(), {
      before: 'x = 1',
      after: 'x = 2',
      expectedSourceHash: 'hash-1',
      tool: 'jupyter_update_cell'
    });

    expect(proposal.status).toBe('pending');
    expect(proposal.before).toBe('x = 1');
    expect(proposal.after).toBe('x = 2');
    expect(store.pendingFor(target())).toEqual(proposal);
    expect(store.proposals[0]).toEqual(proposal);
  });

  it('emits changed on creation', () => {
    const store = new ProposeStore();
    let changes = 0;
    store.changed.connect(() => changes++);
    store.propose(target(), {
      before: '',
      after: 'x',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });
    expect(changes).toBe(1);
  });

  it('a second proposal on the same cell throws ProposalAlreadyPendingError, leaving the first untouched', () => {
    const store = new ProposeStore();
    const { proposal: first } = store.propose(target(), {
      before: 'a',
      after: 'b',
      expectedSourceHash: 'h1',
      tool: 'jupyter_update_cell'
    });

    expect(() =>
      store.propose(target(), {
        before: 'a',
        after: 'c',
        expectedSourceHash: 'h1',
        tool: 'jupyter_update_cell'
      })
    ).toThrow(ProposalAlreadyPendingError);

    expect(store.pendingFor(target())).toEqual(first);
    expect(store.proposals).toHaveLength(1);
  });

  it('proposals on different cells (or notebooks) do not collide', () => {
    const store = new ProposeStore();
    store.propose(target('cell-1'), {
      before: '',
      after: 'a',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });
    // Different cell: fine.
    expect(() =>
      store.propose(target('cell-2'), {
        before: '',
        after: 'b',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      })
    ).not.toThrow();
    // Same cell id, different notebook: also fine.
    expect(() =>
      store.propose(target('cell-1', '/other.ipynb'), {
        before: '',
        after: 'c',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      })
    ).not.toThrow();
    expect(store.proposals).toHaveLength(3);
  });
});

describe('ProposeStore.accept / deny', () => {
  it('accept resolves the decision promise with {status: "accepted"} and clears pendingFor', async () => {
    const store = new ProposeStore();
    const { proposal, decision } = store.propose(target(), {
      before: 'a',
      after: 'b',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });

    const accepted = store.accept(proposal.id);
    expect(accepted.status).toBe('accepted');
    expect(typeof accepted.resolvedAt).toBe('string');
    expect(store.pendingFor(target())).toBeNull();

    const outcome: IProposalDecision = await decision;
    expect(outcome).toEqual({ status: 'accepted' });
  });

  it('deny with a reason resolves the decision promise carrying that reason, and records denyReason', async () => {
    const store = new ProposeStore();
    const { proposal, decision } = store.propose(target(), {
      before: 'a',
      after: 'b',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });

    const denied = store.deny(
      proposal.id,
      'This changes behavior for free-tier users.'
    );
    expect(denied.status).toBe('denied');
    expect(denied.denyReason).toBe(
      'This changes behavior for free-tier users.'
    );
    expect(store.pendingFor(target())).toBeNull();

    const outcome = await decision;
    expect(outcome).toEqual({
      status: 'denied',
      reason: 'This changes behavior for free-tier users.'
    });
  });

  it('deny without a reason resolves with reason undefined', async () => {
    const store = new ProposeStore();
    const { proposal, decision } = store.propose(target(), {
      before: 'a',
      after: 'b',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });

    store.deny(proposal.id);
    const outcome = await decision;
    expect(outcome).toEqual({ status: 'denied', reason: undefined });
  });

  it('a cell is free for a new proposal once its pending one is resolved', () => {
    const store = new ProposeStore();
    const { proposal } = store.propose(target(), {
      before: 'a',
      after: 'b',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });
    store.deny(proposal.id, 'no');

    expect(() =>
      store.propose(target(), {
        before: 'a',
        after: 'c',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      })
    ).not.toThrow();
  });

  it('accepting or denying an unknown id throws', () => {
    const store = new ProposeStore();
    expect(() => store.accept('nope')).toThrow();
    expect(() => store.deny('nope')).toThrow();
  });

  it('accepting or denying an already-settled proposal throws', () => {
    const store = new ProposeStore();
    const { proposal } = store.propose(target(), {
      before: 'a',
      after: 'b',
      expectedSourceHash: 'h',
      tool: 'jupyter_update_cell'
    });
    store.accept(proposal.id);
    expect(() => store.accept(proposal.id)).toThrow();
    expect(() => store.deny(proposal.id)).toThrow();
  });
});

describe('ProposeStore abort handling', () => {
  it('an already-aborted signal rejects the decision immediately with a ToolError coded ABORTED, and marks the proposal aborted', async () => {
    const store = new ProposeStore();
    const controller = new AbortController();
    controller.abort();

    const { proposal, decision } = store.propose(
      target(),
      {
        before: 'a',
        after: 'b',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      },
      controller.signal
    );

    await expect(decision).rejects.toBeInstanceOf(ToolError);
    await decision.catch(err => {
      expect((err as ToolError).code).toBe('ABORTED');
    });
    expect(proposal.status).toBe('aborted');
    expect(store.pendingFor(target())).toBeNull();
  });

  it('firing the signal later aborts a still-pending proposal the same way', async () => {
    const store = new ProposeStore();
    const controller = new AbortController();

    const { proposal, decision } = store.propose(
      target(),
      {
        before: 'a',
        after: 'b',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      },
      controller.signal
    );
    expect(proposal.status).toBe('pending');

    controller.abort();

    await expect(decision).rejects.toMatchObject({ code: 'ABORTED' });
    expect(proposal.status).toBe('aborted');
  });

  it('a cell is free for a new proposal once its pending one is aborted', async () => {
    const store = new ProposeStore();
    const controller = new AbortController();
    const { decision } = store.propose(
      target(),
      {
        before: 'a',
        after: 'b',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      },
      controller.signal
    );
    controller.abort();
    await decision.catch(() => undefined);

    expect(() =>
      store.propose(target(), {
        before: 'a',
        after: 'c',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      })
    ).not.toThrow();
  });

  it('aborting after a decision was already made is a no-op', async () => {
    const store = new ProposeStore();
    const controller = new AbortController();
    const { proposal, decision } = store.propose(
      target(),
      {
        before: 'a',
        after: 'b',
        expectedSourceHash: 'h',
        tool: 'jupyter_update_cell'
      },
      controller.signal
    );
    store.accept(proposal.id);
    controller.abort();

    const outcome = await decision;
    expect(outcome).toEqual({ status: 'accepted' });
    expect(proposal.status).toBe('accepted');
  });
});

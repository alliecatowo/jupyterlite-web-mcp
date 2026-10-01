/**
 * `ProposalLifecycle` (`src/propose/lifecycle.ts`): pending proposals whose
 * cell or notebook disappears are auto-denied, so their tool calls never
 * hang with no Accept/Deny UI.
 */
import {
  AUTO_DENY_REASONS,
  ProposalLifecycle
} from '../../src/propose/lifecycle';
import { IProposalDecision, ProposeStore } from '../../src/propose/store';
import { FakeCell, FakePanel, FakeTracker, flush } from './fake-notebooks';

function params() {
  return {
    before: 'a',
    after: 'b',
    expectedSourceHash: 'h',
    tool: 'jupyter_update_cell'
  };
}

async function setup(paths: string[] = ['nb.ipynb']) {
  const tracker = new FakeTracker();
  const store = new ProposeStore();
  const lifecycle = new ProposalLifecycle(tracker as any, store);
  const panels = paths.map(path =>
    tracker.open(new FakePanel(path, [new FakeCell('c1'), new FakeCell('c2')]))
  );
  await flush();
  const propose = (cellId = 'c1', notebookPath = paths[0]) =>
    store.propose({ notebookPath, cellId }, params());
  return { tracker, store, lifecycle, panels, propose };
}

describe('ProposalLifecycle', () => {
  it('auto-denies when the target cell is deleted', async () => {
    const { store, panels, propose } = await setup();
    const { proposal, decision } = propose('c1');
    const other = propose('c2');
    panels[0].cells.remove(0);
    await expect(decision).resolves.toEqual<IProposalDecision>({
      status: 'denied',
      reason: AUTO_DENY_REASONS.cellRemoved
    });
    expect(proposal.status).toBe('denied');
    expect(other.proposal.status).toBe('pending');
    expect(store.pending).toHaveLength(1);
  });

  it('keeps a proposal pending when its cell is moved (same id, new model)', async () => {
    const { panels, propose } = await setup();
    const { proposal } = propose('c1');
    panels[0].cells.move(0, 1);
    expect(proposal.status).toBe('pending');
  });

  it('auto-denies when the notebook is closed', async () => {
    const { panels, propose } = await setup();
    const { decision } = propose('c1');
    panels[0].dispose();
    await expect(decision).resolves.toEqual({
      status: 'denied',
      reason: AUTO_DENY_REASONS.notebookClosed
    });
  });

  it('keeps a proposal pending when another view of the same notebook stays open', async () => {
    const { tracker, store, panels, propose } = await setup();
    const second = tracker.open(
      new FakePanel('nb.ipynb', [new FakeCell('c1')])
    );
    await flush();
    const { proposal } = propose('c1');
    panels[0].dispose();
    expect(proposal.status).toBe('pending');
    second.dispose();
    expect(proposal.status).toBe('denied');
    expect(store.pending).toHaveLength(0);
  });

  it('auto-denies when the notebook is renamed', async () => {
    const { panels, propose } = await setup();
    const { decision } = propose('c1');
    panels[0].rename('renamed.ipynb');
    await expect(decision).resolves.toEqual({
      status: 'denied',
      reason: AUTO_DENY_REASONS.notebookRenamed
    });
  });

  it('leaves proposals on other notebooks alone', async () => {
    const { panels, propose } = await setup(['a.ipynb', 'b.ipynb']);
    const onB = propose('c1', 'b.ipynb');
    panels[0].cells.remove(0);
    panels[0].dispose();
    expect(onB.proposal.status).toBe('pending');
  });

  it('does nothing to proposals already decided, and nothing after dispose', async () => {
    const { store, lifecycle, panels, propose } = await setup();
    const accepted = propose('c1').proposal;
    store.accept(accepted.id);
    panels[0].cells.remove(0);
    expect(accepted.status).toBe('accepted');

    const pending = propose('c2').proposal;
    lifecycle.dispose();
    panels[0].dispose();
    expect(pending.status).toBe('pending');
  });
});

/**
 * Store bounds, auto-deny and the deny-reason byte cap. Pure: no JupyterLab
 * runtime, like `propose-store.spec.ts`.
 */
import {
  MAX_DENY_REASON_BYTES,
  MAX_SETTLED_PROPOSALS,
  ProposeStore,
  truncateUtf8
} from '../../src/propose/store';

function target(cellId = 'cell-1', notebookPath = '/nb.ipynb') {
  return { notebookPath, cellId };
}

function params() {
  return {
    before: 'a',
    after: 'b',
    expectedSourceHash: 'h',
    tool: 'jupyter_update_cell'
  };
}

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

describe('ProposeStore bounds', () => {
  it('never evicts a pending proposal, however many settled ones follow', () => {
    const store = new ProposeStore();
    const first = store.propose(target('keep'), params()).proposal;
    for (let i = 0; i < MAX_SETTLED_PROPOSALS + 150; i++) {
      const { proposal } = store.propose(target(`c${i}`), params());
      store.deny(proposal.id);
    }
    expect(store.pending.map(p => p.id)).toEqual([first.id]);
    expect(store.proposals).toContain(first);
    expect(store.pendingFor(target('keep'))).toBe(first);
    // Still decidable.
    expect(store.accept(first.id).status).toBe('accepted');
  });

  it('keeps only the newest settled proposals and forgets older ones entirely', () => {
    const store = new ProposeStore();
    const ids: string[] = [];
    for (let i = 0; i < MAX_SETTLED_PROPOSALS + 5; i++) {
      const { proposal } = store.propose(target(`c${i}`), params());
      store.deny(proposal.id);
      ids.push(proposal.id);
    }
    expect(store.proposals).toHaveLength(MAX_SETTLED_PROPOSALS);
    expect(store.proposals[0].id).toBe(ids[ids.length - 1]);
    // Evicted entries are gone from the id index too.
    expect(() => store.accept(ids[0])).toThrow(/Unknown proposal/);
  });
});

describe('ProposeStore.autoDeny', () => {
  it('denies a pending proposal with the given reason', async () => {
    const store = new ProposeStore();
    const { proposal, decision } = store.propose(target(), params());
    expect(store.autoDeny(proposal.id, 'cell gone')).toBe(true);
    await expect(decision).resolves.toEqual({
      status: 'denied',
      reason: 'cell gone'
    });
    expect(proposal.status).toBe('denied');
    expect(store.pending).toHaveLength(0);
  });

  it('is a no-op for an unknown or already-settled proposal', () => {
    const store = new ProposeStore();
    const { proposal } = store.propose(target(), params());
    store.accept(proposal.id);
    expect(store.autoDeny(proposal.id, 'late')).toBe(false);
    expect(store.autoDeny('nope', 'x')).toBe(false);
    expect(proposal.status).toBe('accepted');
  });
});

describe('deny reason byte cap', () => {
  it('truncateUtf8 respects the byte budget without splitting code points', () => {
    expect(truncateUtf8('abc', 2)).toBe('ab');
    expect(truncateUtf8('abc', 3)).toBe('abc');
    expect(truncateUtf8('héllo', 2)).toBe('h'); // é is 2 bytes
    expect(truncateUtf8('日本語', 7)).toBe('日本'); // 3 bytes each
    expect(truncateUtf8('a\u{1F600}b', 4)).toBe('a'); // the emoji is 4 bytes, a surrogate pair
    expect(truncateUtf8('a\u{1F600}b', 5)).toBe('a\u{1F600}');

    const long = '\u{1F600}'.repeat(1000) + '日'.repeat(1000);
    const cut = truncateUtf8(long);
    expect(utf8Length(cut)).toBeLessThanOrEqual(MAX_DENY_REASON_BYTES);
    expect(utf8Length(cut)).toBeGreaterThan(MAX_DENY_REASON_BYTES - 4);
    expect(/[\uD800-\uDBFF]$/.test(cut)).toBe(false);
  });

  it('deny caps the reason the agent receives at MAX_DENY_REASON_BYTES', async () => {
    const store = new ProposeStore();
    const { proposal, decision } = store.propose(target(), params());
    store.deny(proposal.id, '日'.repeat(5000));
    const outcome = (await decision) as { status: 'denied'; reason?: string };
    expect(utf8Length(outcome.reason!)).toBeLessThanOrEqual(
      MAX_DENY_REASON_BYTES
    );
    expect(proposal.denyReason).toBe(outcome.reason);
  });
});

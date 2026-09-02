import {
  normalizeReview,
  createThread,
  withMessage,
  withStatus,
  upsertThread,
  countOpen,
  threadsForCell,
  newId,
  emptyReview,
  HUMAN_AUTHOR,
  AGENT_AUTHOR,
  type IAnchor,
  type IThread
} from '../../src/review/model';

const CELL_ANCHOR: IAnchor = { kind: 'cell', cellId: 'cell-1' };

describe('normalizeReview', () => {
  it.each([undefined, null, 42, 'x', {}, { version: 1, threads: 'nope' }])(
    'returns an empty review for %p',
    input => {
      expect(normalizeReview(input as unknown)).toEqual(emptyReview());
    }
  );

  it('drops a thread with no id', () => {
    const raw = {
      threads: [
        { anchor: { cellId: 'c1' }, messages: [{ id: 'm1', body: 'hi' }] }
      ]
    };
    expect(normalizeReview(raw).threads).toHaveLength(0);
  });

  it('drops a thread with no anchor.cellId', () => {
    const raw = {
      threads: [{ id: 't1', anchor: {}, messages: [{ id: 'm1', body: 'hi' }] }]
    };
    expect(normalizeReview(raw).threads).toHaveLength(0);
  });

  it('drops a thread with no messages array', () => {
    const raw = {
      threads: [{ id: 't1', anchor: { cellId: 'c1' } }]
    };
    expect(normalizeReview(raw).threads).toHaveLength(0);
  });

  it('keeps a valid thread', () => {
    const raw = {
      threads: [
        {
          id: 't1',
          anchor: { cellId: 'c1' },
          messages: [
            { id: 'm1', body: 'hi', author: { kind: 'human', name: 'Al' } }
          ]
        }
      ]
    };
    const result = normalizeReview(raw);
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].id).toBe('t1');
    expect(result.threads[0].anchor.cellId).toBe('c1');
    expect(result.threads[0].messages).toHaveLength(1);
  });

  it('coerces an unknown status to open, and keeps resolved', () => {
    const makeThread = (status: unknown) => ({
      id: 't1',
      status,
      anchor: { cellId: 'c1' },
      messages: [{ id: 'm1', body: 'hi' }]
    });
    expect(
      normalizeReview({ threads: [makeThread('bogus')] }).threads[0].status
    ).toBe('open');
    expect(
      normalizeReview({ threads: [makeThread(undefined)] }).threads[0].status
    ).toBe('open');
    expect(
      normalizeReview({ threads: [makeThread('resolved')] }).threads[0].status
    ).toBe('resolved');
  });

  it('coerces an unknown author.kind to human, and keeps agent', () => {
    const makeThread = (authorKind: unknown) => ({
      id: 't1',
      anchor: { cellId: 'c1' },
      messages: [{ id: 'm1', body: 'hi', author: { kind: authorKind } }]
    });
    expect(
      normalizeReview({ threads: [makeThread('bogus')] }).threads[0].messages[0]
        .author.kind
    ).toBe('human');
    expect(
      normalizeReview({ threads: [makeThread('agent')] }).threads[0].messages[0]
        .author.kind
    ).toBe('agent');
  });

  it('never throws on deeply weird input', () => {
    const weird = {
      threads: [{ id: 1, anchor: { cellId: null }, messages: [{ body: {} }] }]
    };
    expect(() => normalizeReview(weird)).not.toThrow();
    expect(normalizeReview(weird)).toEqual(emptyReview());
  });
});

describe('createThread / withMessage / withStatus (immutability)', () => {
  it('createThread produces an open thread with one message', () => {
    const thread = createThread(CELL_ANCHOR, 'first comment', HUMAN_AUTHOR);
    expect(thread.status).toBe('open');
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].body).toBe('first comment');
    expect(new Date(thread.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('withMessage appends without mutating the original', () => {
    const original = createThread(CELL_ANCHOR, 'first', HUMAN_AUTHOR);
    const originalSnapshot = JSON.parse(JSON.stringify(original));
    const updated = withMessage(original, 'second', AGENT_AUTHOR);

    expect(original).toEqual(originalSnapshot);
    expect(updated.messages).toHaveLength(2);
    expect(updated.messages[1].body).toBe('second');
    expect(updated.messages[1].author).toEqual(AGENT_AUTHOR);
    expect(new Date(updated.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('withStatus changes status without mutating the original', () => {
    const original = createThread(CELL_ANCHOR, 'first', HUMAN_AUTHOR);
    const originalSnapshot = JSON.parse(JSON.stringify(original));
    const updated = withStatus(original, 'resolved');

    expect(original).toEqual(originalSnapshot);
    expect(original.status).toBe('open');
    expect(updated.status).toBe('resolved');
    expect(new Date(updated.updatedAt).toString()).not.toBe('Invalid Date');
  });
});

describe('upsertThread', () => {
  it('replaces an existing thread by id without duplicating, preserving others', () => {
    const t1 = createThread({ kind: 'cell', cellId: 'c1' }, 'a', HUMAN_AUTHOR);
    const t2 = createThread({ kind: 'cell', cellId: 'c2' }, 'b', HUMAN_AUTHOR);
    const data = { version: 1, threads: [t1, t2] };

    const t1Updated: IThread = { ...t1, status: 'resolved' };
    const result = upsertThread(data, t1Updated);

    expect(result.threads).toHaveLength(2);
    expect(result.threads.find(t => t.id === t1.id)?.status).toBe('resolved');
    expect(result.threads.find(t => t.id === t2.id)).toEqual(t2);
  });

  it('inserts a new thread when its id is not present', () => {
    const t1 = createThread({ kind: 'cell', cellId: 'c1' }, 'a', HUMAN_AUTHOR);
    const data = { version: 1, threads: [t1] };
    const t2 = createThread({ kind: 'cell', cellId: 'c2' }, 'b', HUMAN_AUTHOR);

    const result = upsertThread(data, t2);
    expect(result.threads).toHaveLength(2);
    expect(result.threads.map(t => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });
});

describe('countOpen', () => {
  it('counts only open threads', () => {
    const t1 = createThread({ kind: 'cell', cellId: 'c1' }, 'a', HUMAN_AUTHOR);
    const t2 = withStatus(
      createThread({ kind: 'cell', cellId: 'c2' }, 'b', HUMAN_AUTHOR),
      'resolved'
    );
    const data = { version: 1, threads: [t1, t2] };
    expect(countOpen(data)).toBe(1);
  });
});

describe('threadsForCell', () => {
  it('returns only threads anchored to the given cell', () => {
    const t1 = createThread({ kind: 'cell', cellId: 'c1' }, 'a', HUMAN_AUTHOR);
    const t2 = createThread({ kind: 'cell', cellId: 'c2' }, 'b', HUMAN_AUTHOR);
    const t3 = createThread({ kind: 'cell', cellId: 'c1' }, 'c', HUMAN_AUTHOR);
    const data = { version: 1, threads: [t1, t2, t3] };
    expect(threadsForCell(data, 'c1').map(t => t.id)).toEqual([t1.id, t3.id]);
  });
});

describe('newId', () => {
  it('returns distinct values across 100 calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});

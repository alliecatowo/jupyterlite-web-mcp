import {
  accessLabel,
  appendHistory,
  CELL_METADATA_KEY,
  DEFAULT_CELL_ACCESS,
  effectiveAccess,
  ICellAccessMetadata,
  IHistoryEntry,
  nextAccess,
  normalizeCellMetadata
} from '../../src/access/model';
import { LIMITS } from '../../src/limits';

describe('CELL_METADATA_KEY', () => {
  it('is the shared key both access and provenance are stored under', () => {
    expect(CELL_METADATA_KEY).toBe('jupyterlite_webmcp');
  });
});

describe('effectiveAccess / DEFAULT_CELL_ACCESS', () => {
  it('defaults to write when access is absent', () => {
    expect(DEFAULT_CELL_ACCESS).toBe('write');
    expect(effectiveAccess({})).toBe('write');
  });

  it('reflects an explicit access value', () => {
    expect(effectiveAccess({ access: 'read' })).toBe('read');
    expect(effectiveAccess({ access: 'none' })).toBe('none');
  });
});

describe('nextAccess', () => {
  it('cycles write -> read -> none -> write', () => {
    expect(nextAccess('write')).toBe('read');
    expect(nextAccess('read')).toBe('none');
    expect(nextAccess('none')).toBe('write');
  });
});

describe('accessLabel', () => {
  it('names each state in plain words', () => {
    expect(accessLabel('write')).toMatch(/edit/i);
    expect(accessLabel('read')).toMatch(/read/i);
    expect(accessLabel('none')).toMatch(/hidden/i);
  });
});

describe('normalizeCellMetadata: defaults and defensive normalization', () => {
  it('never throws and returns {} for wildly malformed input', () => {
    expect(normalizeCellMetadata(null)).toEqual({});
    expect(normalizeCellMetadata(undefined)).toEqual({});
    expect(normalizeCellMetadata('nonsense')).toEqual({});
    expect(normalizeCellMetadata(42)).toEqual({});
    expect(normalizeCellMetadata([])).toEqual({});
  });

  it('returns {} for an empty object (no access, no history)', () => {
    expect(normalizeCellMetadata({})).toEqual({});
  });

  it('drops an invalid access value rather than throwing', () => {
    expect(normalizeCellMetadata({ access: 'delete-everything' })).toEqual({});
    expect(normalizeCellMetadata({ access: 42 })).toEqual({});
  });

  it('keeps a valid access value', () => {
    expect(normalizeCellMetadata({ access: 'read' })).toEqual({
      access: 'read'
    });
    expect(normalizeCellMetadata({ access: 'none' })).toEqual({
      access: 'none'
    });
  });

  it('drops malformed history entries individually, keeping well-formed ones', () => {
    const raw = {
      access: 'write',
      history: [
        { at: '2026-01-01T00:00:00.000Z', actor: 'human', action: 'edited' },
        'not an object',
        { at: '2026-01-01T00:00:01.000Z', actor: 'bogus', action: 'edited' },
        { at: '2026-01-01T00:00:02.000Z', actor: 'agent', action: 'bogus' },
        { actor: 'agent', action: 'ran' }, // missing at
        {
          at: '2026-01-01T00:00:03.000Z',
          actor: 'agent',
          action: 'ran',
          tool: 'jupyter_run_cells'
        }
      ]
    };
    const normalized = normalizeCellMetadata(raw);
    expect(normalized.access).toBe('write');
    expect(normalized.history).toEqual([
      { at: '2026-01-01T00:00:00.000Z', actor: 'human', action: 'edited' },
      {
        at: '2026-01-01T00:00:03.000Z',
        actor: 'agent',
        action: 'ran',
        tool: 'jupyter_run_cells'
      }
    ]);
  });

  it('ignores a non-array history rather than throwing', () => {
    expect(normalizeCellMetadata({ history: 'nope' })).toEqual({});
  });

  it('bounds an oversized history to the most recent MAX_CELL_HISTORY_ENTRIES', () => {
    const history: IHistoryEntry[] = [];
    for (let i = 0; i < LIMITS.MAX_CELL_HISTORY_ENTRIES + 10; i++) {
      history.push({
        at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        actor: i % 2 === 0 ? 'human' : 'agent',
        action: 'edited'
      });
    }
    const normalized = normalizeCellMetadata({ history });
    expect(normalized.history).toHaveLength(LIMITS.MAX_CELL_HISTORY_ENTRIES);
    expect(normalized.history?.[normalized.history.length - 1]).toEqual(
      history[history.length - 1]
    );
  });
});

describe('appendHistory: coalescing and bounding', () => {
  function entry(
    at: string,
    actor: 'human' | 'agent',
    action: string
  ): IHistoryEntry {
    return { at, actor, action } as IHistoryEntry;
  }

  it('coalesces same actor+action within the coalesce window into one entry', () => {
    const metadata: ICellAccessMetadata = {
      history: [entry('2026-01-01T00:00:00.000Z', 'human', 'edited')]
    };
    const updated = appendHistory(
      metadata,
      entry('2026-01-01T00:00:30.000Z', 'human', 'edited')
    );
    expect(updated.history).toHaveLength(1);
    expect(updated.history?.[0].at).toBe('2026-01-01T00:00:30.000Z');
  });

  it('does not coalesce once the window has elapsed', () => {
    const metadata: ICellAccessMetadata = {
      history: [entry('2026-01-01T00:00:00.000Z', 'human', 'edited')]
    };
    const updated = appendHistory(
      metadata,
      entry('2026-01-01T00:01:01.000Z', 'human', 'edited')
    );
    expect(updated.history).toHaveLength(2);
  });

  it('does not coalesce a different actor even within the window', () => {
    const metadata: ICellAccessMetadata = {
      history: [entry('2026-01-01T00:00:00.000Z', 'human', 'edited')]
    };
    const updated = appendHistory(
      metadata,
      entry('2026-01-01T00:00:05.000Z', 'agent', 'edited')
    );
    expect(updated.history).toHaveLength(2);
  });

  it('does not coalesce a different action even within the window', () => {
    const metadata: ICellAccessMetadata = {
      history: [entry('2026-01-01T00:00:00.000Z', 'agent', 'inserted')]
    };
    const updated = appendHistory(
      metadata,
      entry('2026-01-01T00:00:05.000Z', 'agent', 'edited')
    );
    expect(updated.history).toHaveLength(2);
  });

  it('bounds the result to MAX_CELL_HISTORY_ENTRIES, dropping the oldest first', () => {
    let metadata: ICellAccessMetadata = {};
    // Space entries far enough apart (and alternate actor) that none coalesce.
    for (let i = 0; i < LIMITS.MAX_CELL_HISTORY_ENTRIES + 5; i++) {
      const at = new Date(2026, 0, 1, 0, i * 2).toISOString();
      metadata = appendHistory(
        metadata,
        entry(at, i % 2 === 0 ? 'human' : 'agent', 'edited')
      );
    }
    expect(metadata.history).toHaveLength(LIMITS.MAX_CELL_HISTORY_ENTRIES);
    // The oldest 5 entries were dropped; the newest one survives.
    const last = metadata.history?.[metadata.history.length - 1];
    expect(last?.at).toBe(
      new Date(
        2026,
        0,
        1,
        0,
        (LIMITS.MAX_CELL_HISTORY_ENTRIES + 4) * 2
      ).toISOString()
    );
  });

  it('does not mutate the input metadata (immutable)', () => {
    const original: ICellAccessMetadata = {
      history: [entry('2026-01-01T00:00:00.000Z', 'human', 'edited')]
    };
    const originalHistoryRef = original.history;
    appendHistory(original, entry('2026-01-01T05:00:00.000Z', 'agent', 'ran'));
    expect(original.history).toBe(originalHistoryRef);
    expect(original.history).toHaveLength(1);
  });
});

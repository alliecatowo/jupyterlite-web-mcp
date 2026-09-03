import { describeLiveState, summarize } from '../../src/ui/statusText';
import { IActivityEvent } from '../../src/activity/model';
import { IWebMCPState } from '../../src/webmcp/types';

function event(partial: Partial<IActivityEvent>): IActivityEvent {
  return {
    id: 'e1',
    at: new Date().toISOString(),
    participantId: 'agent',
    tool: 'jupyter_get_cells',
    kind: 'read',
    ok: true,
    notebookPath: null,
    cellIds: [],
    summary: 'read a cell',
    durationMs: 5,
    ...partial
  };
}

function state(partial: Partial<IWebMCPState>): IWebMCPState {
  return {
    available: true,
    toolCount: 20,
    toolNames: [],
    recent: [],
    ...partial
  };
}

describe('describeLiveState', () => {
  it('returns null with no event', () => {
    expect(describeLiveState(null)).toBeNull();
  });

  it('returns null once the event has aged past the window', () => {
    const now = Date.now();
    const stale = event({ at: new Date(now - 5000).toISOString() });
    expect(describeLiveState(stale, () => null, 2500, now)).toBeNull();
  });

  it('describes a single-cell read using a resolved index', () => {
    const now = Date.now();
    const e = event({
      kind: 'read',
      cellIds: ['c1'],
      at: new Date(now - 100).toISOString()
    });
    expect(
      describeLiveState(e, id => (id === 'c1' ? 5 : null), 2500, now)
    ).toBe('reading cell 6');
  });

  it('falls back to "a cell" when the index cannot be resolved', () => {
    const now = Date.now();
    const e = event({
      kind: 'run',
      cellIds: ['c1'],
      at: new Date(now - 100).toISOString()
    });
    expect(describeLiveState(e, () => null, 2500, now)).toBe('running a cell');
  });

  it('describes multiple cells by count', () => {
    const now = Date.now();
    const e = event({
      kind: 'write',
      cellIds: ['c1', 'c2', 'c3'],
      at: new Date(now).toISOString()
    });
    expect(describeLiveState(e, () => null, 2500, now)).toBe(
      'updating 3 cells'
    );
  });

  it('describes a notebook-scoped event with no cell ids', () => {
    const now = Date.now();
    const e = event({
      tool: 'jupyter_get_context',
      kind: 'read',
      cellIds: [],
      at: new Date(now).toISOString()
    });
    expect(describeLiveState(e, () => null, 2500, now)).toBe(
      'reading the notebook'
    );
  });

  it('describes navigation without mentioning cells', () => {
    const now = Date.now();
    const e = event({
      kind: 'navigate',
      cellIds: [],
      at: new Date(now).toISOString()
    });
    expect(describeLiveState(e, () => null, 2500, now)).toBe(
      'opening the notebook'
    );
  });
});

describe('summarize', () => {
  it('reports a registration error', () => {
    const { text, title } = summarize(
      state({ registrationError: 'boom' }),
      null
    );
    expect(text).toBe('WebMCP error');
    expect(title).toContain('boom');
  });

  it('reports WebMCP as unavailable, without a tool count', () => {
    const { text, title } = summarize(
      state({ available: false, toolCount: 0 }),
      null
    );
    expect(text).toBe('WebMCP unavailable');
    expect(title).toContain('document.modelContext');
    expect(text).not.toMatch(/\d/);
  });

  it('reports a quiet idle string when available with no live phrase', () => {
    const { text } = summarize(state({}), null);
    expect(text).toBe('WebMCP ready');
    expect(text).not.toMatch(/\d+ tools?/);
  });

  // The page cannot observe an agent's presence, only its actions. So no
  // idle or unavailable string may claim one is there; only the live
  // string, which is derived from a tool call that actually happened, is
  // allowed to say "Agent".
  it('never claims an agent is present unless one demonstrably acted', () => {
    for (const s of [
      state({}),
      state({ available: false, toolCount: 0 }),
      state({ registrationError: 'boom' })
    ]) {
      expect(summarize(s, null).text).not.toMatch(/[Aa]gent/);
    }
    expect(summarize(state({}), 'running cell 6').text).toMatch(/^Agent · /);
  });

  it('reports the live phrase when one is derived', () => {
    const { text, title } = summarize(state({}), 'running cell 6');
    expect(text).toBe('Agent · running cell 6');
    expect(title).toContain('running cell 6');
  });
});

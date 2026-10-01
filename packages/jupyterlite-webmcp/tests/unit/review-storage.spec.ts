/**
 * Review threads anchored to a cell the owner hid from the agent must be
 * indistinguishable from threads that do not exist: same error code, same
 * message, same details, and never the hidden cell's id. Also covers the
 * byte-correct comment body bound and the per-thread message cap.
 */
jest.mock('@jupyterlab/cells', () => ({ MarkdownCell: class {} }));
jest.mock('@jupyterlab/notebook', () => ({ NotebookPanel: class {} }));

import { NotebookPanel } from '@jupyterlab/notebook';

import { ToolError } from '../../src/jupyter/errors';
import { LIMITS } from '../../src/limits';
import {
  AGENT_AUTHOR,
  capThreadMessages,
  createThread,
  HUMAN_AUTHOR,
  IThread,
  REVIEW_METADATA_KEY,
  withMessage
} from '../../src/review/model';
import { ReviewStore } from '../../src/review/storage';
import { truncateUtf8, utf8Length } from '../../src/utf8';

function makeCell(id: string, access?: string): unknown {
  return {
    id,
    type: 'code',
    sharedModel: {
      getSource: () => 'print(1)',
      getMetadata: (key: string) =>
        key === 'jupyterlite_webmcp' && access ? { access } : undefined
    }
  };
}

function makePanel(cells: unknown[], threads: IThread[]): NotebookPanel {
  const metadata: Record<string, unknown> = {
    [REVIEW_METADATA_KEY]: { version: 1, threads }
  };
  const panel = Object.create(NotebookPanel.prototype);
  panel.context = {
    path: 'test.ipynb',
    model: {
      cells: { length: cells.length, get: (i: number) => cells[i] },
      sharedModel: {
        getMetadata: () => metadata,
        setMetadata: (key: string, value: unknown) => {
          metadata[key] = value;
        }
      }
    }
  };
  return panel;
}

function makeStore(): ReviewStore {
  const signal = { connect: () => undefined };
  return new ReviewStore({
    currentChanged: signal,
    activeCellChanged: signal
  } as never);
}

function errorOf(f: () => unknown): ToolError {
  try {
    f();
  } catch (error) {
    return error as ToolError;
  }
  throw new Error('expected an error');
}

describe('ReviewStore: threads on hidden cells', () => {
  const hiddenThread = {
    ...createThread(
      { kind: 'cell', cellId: 'secret-cell' },
      'hi',
      HUMAN_AUTHOR
    ),
    id: 'thread-hidden'
  };
  const readThread = {
    ...createThread({ kind: 'cell', cellId: 'ro-cell' }, 'hi', HUMAN_AUTHOR),
    id: 'thread-ro'
  };
  const store = makeStore();
  const panel = (): NotebookPanel =>
    makePanel(
      [makeCell('secret-cell', 'none'), makeCell('ro-cell', 'read')],
      [hiddenThread, readThread]
    );

  /** What an unknown id gives, with the hidden thread's id substituted. */
  function unknownError(): ToolError {
    return errorOf(() => store.requireAgentThread(panel(), 'thread-hidden-x'));
  }

  function expectSameAsUnknown(error: ToolError): void {
    const unknown = unknownError();
    expect(error).toBeInstanceOf(ToolError);
    expect(error.code).toBe('COMMENT_NOT_FOUND');
    expect(error.code).toBe(unknown.code);
    expect(error.message).toBe(
      unknown.message.replace('thread-hidden-x', 'thread-hidden')
    );
    expect(error.details).toEqual({
      ...unknown.details,
      threadId: 'thread-hidden'
    });
    expect(JSON.stringify(error.details)).not.toContain('secret-cell');
    expect(error.message).not.toContain('secret-cell');
  }

  it('reading gives COMMENT_NOT_FOUND, like an unknown thread', () => {
    expectSameAsUnknown(
      errorOf(() => store.requireAgentThread(panel(), 'thread-hidden'))
    );
  });

  it('an agent reply gives COMMENT_NOT_FOUND', () => {
    expectSameAsUnknown(
      errorOf(() => store.reply(panel(), 'thread-hidden', 'x', AGENT_AUTHOR))
    );
  });

  it('an agent resolve or reopen gives COMMENT_NOT_FOUND', () => {
    expectSameAsUnknown(
      errorOf(() =>
        store.setStatus(
          panel(),
          'thread-hidden',
          'resolved',
          null,
          AGENT_AUTHOR
        )
      )
    );
    expectSameAsUnknown(
      errorOf(() =>
        store.setStatus(
          panel(),
          'thread-hidden',
          'open',
          undefined,
          AGENT_AUTHOR
        )
      )
    );
  });

  it('a human can still reply to a thread on their hidden cell', () => {
    const updated = store.reply(panel(), 'thread-hidden', 'ok', HUMAN_AUTHOR);
    expect(updated.messages).toHaveLength(2);
  });

  it('a read-only cell is readable but replying is CELL_ACCESS_DENIED', () => {
    expect(store.requireAgentThread(panel(), 'thread-ro').id).toBe('thread-ro');
    const error = errorOf(() =>
      store.reply(panel(), 'thread-ro', 'x', AGENT_AUTHOR)
    );
    expect(error.code).toBe('CELL_ACCESS_DENIED');
  });

  it('isThreadVisibleToAgent agrees', () => {
    expect(store.isThreadVisibleToAgent(panel(), hiddenThread)).toBe(false);
    expect(store.isThreadVisibleToAgent(panel(), readThread)).toBe(true);
  });
});

describe('ReviewStore comment body bound', () => {
  it('bounds a human comment body by UTF-8 bytes, not characters', () => {
    const store = makeStore();
    const panel = makePanel([makeCell('a')], []);
    const body = '€'.repeat(LIMITS.MAX_COMMENT_BODY_BYTES);
    const thread = store.createThread(
      panel,
      { kind: 'cell', cellId: 'a' },
      body,
      HUMAN_AUTHOR
    );
    const stored = thread.messages[0].body;
    expect(utf8Length(stored)).toBeLessThanOrEqual(
      LIMITS.MAX_COMMENT_BODY_BYTES
    );
    expect(stored.length).toBe(Math.floor(LIMITS.MAX_COMMENT_BODY_BYTES / 3));
  });
});

describe('truncateUtf8', () => {
  it('cuts before a 3-byte character that would cross the limit', () => {
    expect(truncateUtf8('ab€', 4)).toBe('ab');
    expect(truncateUtf8('ab€', 5)).toBe('ab€');
  });

  it('never splits a surrogate pair', () => {
    const out = truncateUtf8('a😀b', 4);
    expect(out).toBe('a');
    expect(truncateUtf8('a😀b', 5)).toBe('a😀');
    expect(/[\ud800-\udbff]$/.test(out)).toBe(false);
  });

  it('agrees with Buffer.byteLength', () => {
    const s = 'aé€😀';
    expect(utf8Length(s)).toBe(Buffer.byteLength(s, 'utf8'));
  });
});

describe('capThreadMessages', () => {
  function threadWith(n: number, bodySize = 10): IThread {
    let thread = createThread(
      { kind: 'cell', cellId: 'a' },
      'first',
      HUMAN_AUTHOR
    );
    for (let i = 1; i < n; i++) {
      thread = withMessage(
        thread,
        `m${i}` + 'x'.repeat(bodySize),
        AGENT_AUTHOR
      );
    }
    return thread;
  }

  it('returns a short thread unchanged', () => {
    const thread = threadWith(3);
    const capped = capThreadMessages(thread, 20, 100000);
    expect(capped.omittedMessages).toBe(0);
    expect(capped.thread.messages).toEqual(thread.messages);
  });

  it('keeps the first and the most recent messages up to the count cap', () => {
    const thread = threadWith(30);
    const capped = capThreadMessages(thread, 5, 100000);
    expect(capped.thread.messages).toHaveLength(5);
    expect(capped.omittedMessages).toBe(25);
    expect(capped.thread.messages[0].body).toBe('first');
    expect(capped.thread.messages[4]).toEqual(thread.messages[29]);
    expect(capped.thread.messages[1]).toEqual(thread.messages[26]);
    expect(thread.messages).toHaveLength(30);
  });

  it('also respects the byte budget', () => {
    const thread = threadWith(10, 1000);
    const capped = capThreadMessages(thread, 20, 3500);
    expect(capped.thread.messages.length).toBeLessThan(10);
    expect(capped.thread.messages[capped.thread.messages.length - 1]).toEqual(
      thread.messages[9]
    );
    expect(capped.omittedMessages).toBe(10 - capped.thread.messages.length);
  });
});

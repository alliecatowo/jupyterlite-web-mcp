import {
  activityKindFor,
  deriveActivity,
  IInvocationFacts
} from '../../src/activity/derive';

const ALL_TOOL_NAMES = [
  'jupyter_get_context',
  'jupyter_list_workspace',
  'jupyter_open_notebook',
  'jupyter_create_notebook',
  'jupyter_get_cells',
  'jupyter_get_cell_access',
  'jupyter_insert_cell',
  'jupyter_update_cell',
  'jupyter_delete_cell',
  'jupyter_run_cells',
  'jupyter_focus_cell',
  'jupyter_save_notebook',
  'jupyter_kernel_action',
  'jupyter_list_comments',
  'jupyter_get_comment',
  'jupyter_create_comment',
  'jupyter_reply_comment',
  'jupyter_resolve_comment',
  'jupyter_reopen_comment',
  'jupyter_focus_comment'
];

function facts(partial: Partial<IInvocationFacts>): IInvocationFacts {
  return {
    tool: 'jupyter_get_context',
    input: {},
    payload: {},
    ok: true,
    durationMs: 1,
    ...partial
  };
}

describe('activityKindFor', () => {
  it('covers all 20 tool names', () => {
    expect(ALL_TOOL_NAMES).toHaveLength(20);
  });

  const expected: Record<string, string> = {
    jupyter_get_context: 'read',
    jupyter_list_workspace: 'read',
    jupyter_list_comments: 'read',
    jupyter_get_comment: 'read',
    jupyter_get_cells: 'read',
    jupyter_get_cell_access: 'read',
    jupyter_insert_cell: 'write',
    jupyter_update_cell: 'write',
    jupyter_delete_cell: 'write',
    jupyter_save_notebook: 'write',
    jupyter_create_notebook: 'write',
    jupyter_run_cells: 'run',
    jupyter_focus_cell: 'focus',
    jupyter_focus_comment: 'focus',
    jupyter_open_notebook: 'navigate',
    jupyter_kernel_action: 'kernel',
    jupyter_create_comment: 'comment',
    jupyter_reply_comment: 'comment',
    jupyter_resolve_comment: 'comment',
    jupyter_reopen_comment: 'comment'
  };

  it.each(ALL_TOOL_NAMES)('classifies %s', tool => {
    expect(activityKindFor(tool)).toBe(expected[tool]);
  });

  it('every one of the 19 tools has an expected classification', () => {
    expect(Object.keys(expected).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it('falls back to read for an unknown tool name', () => {
    expect(activityKindFor('not_a_real_tool')).toBe('read');
  });
});

describe('deriveActivity: cell id extraction', () => {
  it('reads ids from payload.cells[].id, deduped and ordered', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_get_cells',
        payload: { cells: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }
      })
    );
    expect(event.cellIds).toEqual(['a', 'b']);
  });

  it('reads an id from payload.cell.id', () => {
    const event = deriveActivity(
      facts({ tool: 'jupyter_update_cell', payload: { cell: { id: 'c1' } } })
    );
    expect(event.cellIds).toEqual(['c1']);
  });

  it('reads ids from payload.results[].cellId', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_run_cells',
        payload: { results: [{ cellId: 'r1' }, { cellId: 'r2' }] }
      })
    );
    expect(event.cellIds).toEqual(['r1', 'r2']);
  });

  it('reads an id from payload.deletedCellId', () => {
    const event = deriveActivity(
      facts({ tool: 'jupyter_delete_cell', payload: { deletedCellId: 'd1' } })
    );
    expect(event.cellIds).toEqual(['d1']);
  });

  it('reads an id from payload.focus.activeCellId', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_focus_cell',
        payload: { focus: { activeCellId: 'f1' } }
      })
    );
    expect(event.cellIds).toEqual(['f1']);
  });

  it('reads an id from payload.thread.anchor.cellId', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_create_comment',
        payload: { thread: { anchor: { cellId: 't1' } } }
      })
    );
    expect(event.cellIds).toEqual(['t1']);
  });

  it('falls back to input.cellIds', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_run_cells',
        payload: {},
        input: { cellIds: ['i1', 'i2'] }
      })
    );
    expect(event.cellIds).toEqual(['i1', 'i2']);
  });

  it('falls back to input.cellId', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_focus_cell',
        payload: {},
        input: { cellId: 'ic1' }
      })
    );
    expect(event.cellIds).toEqual(['ic1']);
  });

  it('falls back to input.referenceCellId', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_insert_cell',
        payload: {},
        input: { referenceCellId: 'ref1' }
      })
    );
    expect(event.cellIds).toEqual(['ref1']);
  });

  it('falls back to input.anchor.cellId', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_create_comment',
        payload: {},
        input: { anchor: { cellId: 'anc1' } }
      })
    );
    expect(event.cellIds).toEqual(['anc1']);
  });

  it('collects and dedupes across every source, preserving order', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_insert_cell',
        payload: { cell: { id: 'new-cell' } },
        input: { referenceCellId: 'ref-cell', cellId: 'new-cell' }
      })
    );
    expect(event.cellIds).toEqual(['new-cell', 'ref-cell']);
  });

  it('caps at 25 ids', () => {
    const cells = Array.from({ length: 40 }, (_, i) => ({ id: `cell-${i}` }));
    const event = deriveActivity(
      facts({ tool: 'jupyter_get_cells', payload: { cells } })
    );
    expect(event.cellIds).toHaveLength(25);
    expect(event.cellIds[0]).toBe('cell-0');
    expect(event.cellIds[24]).toBe('cell-24');
  });

  it('is an empty array when nothing matches', () => {
    const event = deriveActivity(
      facts({ tool: 'jupyter_get_context', payload: {}, input: {} })
    );
    expect(event.cellIds).toEqual([]);
  });

  it('ignores non-string / malformed candidates', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_get_cells',
        payload: { cells: [{ id: 42 }, { id: null }, { id: '' }, { id: 'ok' }] }
      })
    );
    expect(event.cellIds).toEqual(['ok']);
  });
});

describe('deriveActivity: notebookPath extraction', () => {
  it('reads payload.notebook.path first', () => {
    const event = deriveActivity(
      facts({
        payload: { notebook: { path: 'a.ipynb' }, notebookPath: 'b.ipynb' },
        input: { notebookPath: 'c.ipynb' }
      })
    );
    expect(event.notebookPath).toBe('a.ipynb');
  });

  it('falls back to payload.notebookPath', () => {
    const event = deriveActivity(
      facts({
        payload: { notebookPath: 'b.ipynb' },
        input: { notebookPath: 'c.ipynb' }
      })
    );
    expect(event.notebookPath).toBe('b.ipynb');
  });

  it('falls back to input.notebookPath', () => {
    const event = deriveActivity(
      facts({ payload: {}, input: { notebookPath: 'c.ipynb' } })
    );
    expect(event.notebookPath).toBe('c.ipynb');
  });

  it('is null when nothing matches', () => {
    const event = deriveActivity(facts({ payload: {}, input: {} }));
    expect(event.notebookPath).toBeNull();
  });
});

describe('deriveActivity: outputIndex extraction', () => {
  it('reads payload.thread.anchor.outputIndex', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_get_comment',
        payload: { thread: { anchor: { outputIndex: 2 } } }
      })
    );
    expect(event.outputIndex).toBe(2);
  });

  it('falls back to input.anchor.outputIndex', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_create_comment',
        payload: {},
        input: { anchor: { outputIndex: 3 } }
      })
    );
    expect(event.outputIndex).toBe(3);
  });

  it('is undefined when nothing matches', () => {
    const event = deriveActivity(facts({ payload: {}, input: {} }));
    expect(event.outputIndex).toBeUndefined();
  });
});

describe('deriveActivity: failure phrasing', () => {
  it('gives a plain phrasing for STALE_CELL on jupyter_update_cell', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_update_cell',
        ok: false,
        errorCode: 'STALE_CELL',
        payload: {
          error: 'STALE_CELL',
          message: 'Cell changed since it was read.'
        }
      })
    );
    expect(event.summary).toBe(
      'could not edit a cell — the cell changed since it was read'
    );
    expect(event.summary).not.toMatch(/STALE_CELL/);
  });

  it('never surfaces the raw error code in the summary, for any failing tool', () => {
    const codes = [
      'STALE_CELL',
      'CELL_NOT_FOUND',
      'NOTEBOOK_NOT_FOUND',
      'NO_ACTIVE_NOTEBOOK',
      'INVALID_PATH',
      'PATH_EXISTS',
      'INVALID_CELL_TYPE',
      'INVALID_ARGUMENT',
      'KERNEL_UNAVAILABLE',
      'EXECUTION_ERROR',
      'ABORTED',
      'WEBMCP_UNAVAILABLE',
      'COMMENT_NOT_FOUND',
      'COMMENT_ANCHOR_STALE',
      'CELL_ACCESS_DENIED',
      'INTERNAL_ERROR',
      'SOME_UNKNOWN_FUTURE_CODE'
    ];
    for (const tool of ALL_TOOL_NAMES) {
      for (const errorCode of codes) {
        const event = deriveActivity(
          facts({
            tool,
            ok: false,
            errorCode,
            payload: { error: errorCode, message: 'x' }
          })
        );
        expect(event.summary).not.toContain(errorCode);
        expect(event.summary.length).toBeGreaterThan(0);
        expect(event.ok).toBe(false);
        expect(event.errorCode).toBe(errorCode);
      }
    }
  });
});

describe('deriveActivity: success summaries', () => {
  it('summarizes reading multiple cells', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_get_cells',
        payload: { cells: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
      })
    );
    expect(event.summary).toBe('read 3 cells');
  });

  it('summarizes running multiple cells', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_run_cells',
        payload: {
          results: [
            { cellId: 'a', index: 0, status: 'ok' },
            { cellId: 'b', index: 1, status: 'ok' }
          ]
        }
      })
    );
    expect(event.summary).toBe('ran 2 cells');
  });

  it('summarizes a single failing run with the exception name', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_run_cells',
        payload: {
          results: [
            { cellId: 'a', index: 5, status: 'error', ename: 'ValueError' }
          ]
        }
      })
    );
    expect(event.summary).toBe('ran cell 6 — ValueError');
  });

  it('summarizes opening a notebook', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_open_notebook',
        payload: { notebook: { name: 'customer-analysis.ipynb' } }
      })
    );
    expect(event.summary).toBe('opened customer-analysis.ipynb');
  });

  it('summarizes pointing at a cell', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_focus_cell',
        payload: { focus: { activeCellIndex: 3 } }
      })
    );
    expect(event.summary).toBe('pointed at cell 4');
  });

  it('summarizes commenting on a cell', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_create_comment',
        payload: { thread: { anchor: { cellId: 'x' } } }
      })
    );
    expect(event.summary).toBe('commented on a cell');
  });

  it('summarizes restarting the kernel', () => {
    const event = deriveActivity(
      facts({
        tool: 'jupyter_kernel_action',
        payload: { action: 'restart' },
        input: { action: 'restart' }
      })
    );
    expect(event.summary).toBe('restarted the kernel');
  });

  it('summarizes listing the workspace', () => {
    const event = deriveActivity(
      facts({ tool: 'jupyter_list_workspace', payload: {} })
    );
    expect(event.summary).toBe('listed the workspace');
  });
});

describe('deriveActivity never throws', () => {
  const malformedFacts: unknown[] = [
    undefined,
    null,
    42,
    'a string',
    true,
    {},
    {
      tool: 42,
      input: null,
      payload: undefined,
      ok: 'yes',
      durationMs: 'oops'
    },
    {
      tool: 'jupyter_get_cells',
      input: {},
      payload: { cells: 'not-an-array' },
      ok: true
    },
    {
      tool: 'jupyter_get_cells',
      input: {},
      payload: { cells: [null, 1, 'x', {}] },
      ok: true
    },
    {
      tool: 'jupyter_run_cells',
      input: {},
      payload: { results: [{ cellId: {} }] },
      ok: true
    },
    {
      tool: 'jupyter_focus_cell',
      input: null,
      payload: { focus: 'nope' },
      ok: true
    },
    {
      tool: 'jupyter_create_comment',
      input: { anchor: 'nope' },
      payload: { thread: null },
      ok: false,
      errorCode: 123
    },
    { tool: null, input: [], payload: [1, 2, 3], ok: false },
    {
      tool: 'jupyter_open_notebook',
      input: {},
      payload: { notebook: 'nope' },
      ok: true
    },
    {
      tool: 'jupyter_get_context',
      input: {},
      payload: { context: { cell: { index: 'nope' } } },
      ok: true
    }
  ];

  it.each(malformedFacts)('does not throw on %p', malformed => {
    expect(() => deriveActivity(malformed as IInvocationFacts)).not.toThrow();
  });

  it('always returns a well-shaped event for malformed input', () => {
    const event = deriveActivity(undefined as unknown as IInvocationFacts);
    expect(typeof event.tool).toBe('string');
    expect(typeof event.kind).toBe('string');
    expect(typeof event.ok).toBe('boolean');
    expect(Array.isArray(event.cellIds)).toBe(true);
    expect(typeof event.summary).toBe('string');
    expect(event.summary.length).toBeGreaterThan(0);
    expect(typeof event.durationMs).toBe('number');
  });
});

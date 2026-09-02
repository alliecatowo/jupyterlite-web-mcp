import { LIMITS } from '../limits';

/** A `{line, column}` position, used for cursors and selections. */
const POSITION_SCHEMA = {
  type: 'object',
  properties: {
    line: { type: 'integer', minimum: 0, description: 'Zero-based line.' },
    column: { type: 'integer', minimum: 0, description: 'Zero-based column.' }
  },
  required: ['line', 'column'],
  additionalProperties: false
};

/** A start/end range inside one cell editor. */
const RANGE_SCHEMA = {
  type: 'object',
  properties: { start: POSITION_SCHEMA, end: POSITION_SCHEMA },
  required: ['start', 'end'],
  additionalProperties: false
};

/** Optional notebook path; omit it to act on the notebook the human is in. */
const NOTEBOOK_PATH = {
  type: ['string', 'null'],
  description:
    'Workspace-relative notebook path. Omit or pass null to use the notebook the user currently has open.'
};

/** JSON Schemas for every registered tool, keyed by tool name. */
export const SCHEMAS: Record<string, Record<string, unknown>> = {
  jupyter_get_context: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },

  jupyter_list_workspace: {
    type: 'object',
    properties: {
      path: {
        type: ['string', 'null'],
        description: 'Directory to list, relative to the workspace root.'
      },
      recursive: {
        type: 'boolean',
        default: false,
        description: 'Descend into subdirectories.'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: LIMITS.MAX_WORKSPACE_ROWS,
        default: LIMITS.MAX_WORKSPACE_ROWS,
        description: 'Maximum number of entries to return.'
      }
    },
    additionalProperties: false
  },

  jupyter_open_notebook: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path of the notebook to open.'
      },
      cellId: {
        type: ['string', 'null'],
        description: 'Optional cell to activate and scroll to once open.'
      },
      activate: {
        type: 'boolean',
        default: true,
        description: 'Bring the notebook to the front of the user interface.'
      }
    },
    required: ['path'],
    additionalProperties: false
  },

  jupyter_create_notebook: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'File name, with or without the .ipynb extension.'
      },
      directory: {
        type: ['string', 'null'],
        description: 'Directory to create it in. Defaults to the workspace root.'
      },
      kernel: {
        type: ['string', 'null'],
        description:
          'Kernel name or language, for example "python". Defaults to the application default.'
      }
    },
    required: ['name'],
    additionalProperties: false
  },

  jupyter_get_cells: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      cellIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific cells to read. Takes priority over the index range.'
      },
      startIndex: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'First cell index to read.'
      },
      endIndex: {
        type: 'integer',
        minimum: 0,
        description: `Exclusive end index. Defaults to startIndex + ${LIMITS.DEFAULT_CELLS_RETURNED}.`
      },
      includeSource: { type: 'boolean', default: true },
      includeOutputs: {
        type: 'boolean',
        default: false,
        description: 'Include bounded, serialized cell outputs.'
      }
    },
    additionalProperties: false
  },

  jupyter_get_cell_access: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      cellIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific cells to report on. Takes priority over the index range.'
      },
      startIndex: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'First cell index to report on.'
      },
      endIndex: {
        type: 'integer',
        minimum: 0,
        description: `Exclusive end index. Defaults to startIndex + ${LIMITS.DEFAULT_CELLS_RETURNED}.`
      }
    },
    additionalProperties: false
  },

  jupyter_insert_cell: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      referenceCellId: {
        type: ['string', 'null'],
        description: 'Cell to insert relative to. Defaults to the active cell.'
      },
      position: { type: 'string', enum: ['above', 'below'], default: 'below' },
      cellType: {
        type: 'string',
        enum: ['code', 'markdown', 'raw'],
        default: 'code'
      },
      source: { type: 'string', default: '' },
      activate: {
        type: 'boolean',
        default: true,
        description: 'Select the new cell and scroll it into view.'
      }
    },
    additionalProperties: false
  },

  jupyter_update_cell: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      cellId: { type: 'string' },
      source: { type: 'string', description: 'The complete replacement source.' },
      expectedSourceHash: {
        type: 'string',
        description:
          'sourceHash from a previous read of this cell. The write is refused with STALE_CELL if the cell changed since then.'
      }
    },
    required: ['cellId', 'source', 'expectedSourceHash'],
    additionalProperties: false
  },

  jupyter_delete_cell: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      cellId: { type: 'string' },
      expectedSourceHash: {
        type: 'string',
        description: 'sourceHash from a previous read of this cell.'
      }
    },
    required: ['cellId', 'expectedSourceHash'],
    additionalProperties: false
  },

  jupyter_run_cells: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      cellIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Cells to run, in order. Defaults to the active cell. Only cells that already exist in the notebook can be run.'
      },
      stopOnError: { type: 'boolean', default: true }
    },
    additionalProperties: false
  },

  jupyter_focus_cell: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      cellId: { type: 'string' },
      cursor: POSITION_SCHEMA,
      selection: RANGE_SCHEMA
    },
    required: ['cellId'],
    additionalProperties: false
  },

  jupyter_save_notebook: {
    type: 'object',
    properties: { notebookPath: NOTEBOOK_PATH },
    additionalProperties: false
  },

  jupyter_kernel_action: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      action: { type: 'string', enum: ['interrupt', 'restart'] }
    },
    required: ['action'],
    additionalProperties: false
  },

  jupyter_list_comments: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      status: {
        type: 'string',
        enum: ['open', 'resolved', 'all'],
        default: 'open'
      },
      scope: {
        type: 'string',
        enum: ['notebook', 'current-cell'],
        default: 'notebook'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: LIMITS.MAX_COMMENTS_RETURNED,
        default: LIMITS.MAX_COMMENTS_RETURNED
      }
    },
    additionalProperties: false
  },

  jupyter_get_comment: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      threadId: { type: 'string' }
    },
    required: ['threadId'],
    additionalProperties: false
  },

  jupyter_create_comment: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      anchor: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['cell', 'source-range', 'output'] },
          cellId: { type: 'string' },
          selection: RANGE_SCHEMA,
          text: {
            type: 'string',
            description:
              'For a source-range anchor: the exact substring of the cell source to attach to. Simpler and more robust than line/column coordinates.'
          },
          outputIndex: {
            type: 'integer',
            minimum: 0,
            description: 'For an output anchor: which output of the cell.'
          }
        },
        required: ['kind', 'cellId'],
        additionalProperties: false
      },
      message: { type: 'string' }
    },
    required: ['anchor', 'message'],
    additionalProperties: false
  },

  jupyter_reply_comment: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      threadId: { type: 'string' },
      message: { type: 'string' }
    },
    required: ['threadId', 'message'],
    additionalProperties: false
  },

  jupyter_resolve_comment: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      threadId: { type: 'string' },
      resolutionMessage: { type: ['string', 'null'] }
    },
    required: ['threadId'],
    additionalProperties: false
  },

  jupyter_reopen_comment: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      threadId: { type: 'string' }
    },
    required: ['threadId'],
    additionalProperties: false
  },

  jupyter_focus_comment: {
    type: 'object',
    properties: {
      notebookPath: NOTEBOOK_PATH,
      threadId: { type: 'string' }
    },
    required: ['threadId'],
    additionalProperties: false
  }
};

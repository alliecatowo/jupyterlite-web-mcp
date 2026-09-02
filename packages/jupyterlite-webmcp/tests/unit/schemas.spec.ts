import { SCHEMAS } from '../../src/webmcp/schemas';

const EXPECTED_TOOL_NAMES = [
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

describe('SCHEMAS', () => {
  it('exposes exactly the expected set of tool names', () => {
    expect(Object.keys(SCHEMAS).sort()).toEqual(
      EXPECTED_TOOL_NAMES.slice().sort()
    );
  });

  it.each(Object.keys(SCHEMAS))('%s is a well-formed object schema', name => {
    const schema = SCHEMAS[name];
    expect(typeof schema).toBe('object');
    expect(schema).not.toBeNull();
    expect(schema.type).toBe('object');
    expect(typeof schema.properties).toBe('object');
    expect(schema.properties).not.toBeNull();
    expect(schema.additionalProperties).toBe(false);

    if (schema.required !== undefined) {
      expect(Array.isArray(schema.required)).toBe(true);
      const properties = schema.properties as Record<string, unknown>;
      for (const requiredKey of schema.required as string[]) {
        expect(
          Object.prototype.hasOwnProperty.call(properties, requiredKey)
        ).toBe(true);
      }
    }
  });
});

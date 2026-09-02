import { LIMITS } from '../../src/limits';
import {
  EXPORT_FORMATS,
  IExportCellInput,
  renderNotebookMarkdown
} from '../../src/jupyter/export';

function cell(partial: Partial<IExportCellInput>): IExportCellInput {
  return { id: 'c1', type: 'code', source: '', outputs: [], ...partial };
}

describe('EXPORT_FORMATS', () => {
  it('is exactly ["markdown"] for now', () => {
    expect(EXPORT_FORMATS).toEqual(['markdown']);
  });
});

describe('renderNotebookMarkdown', () => {
  it('renders a markdown cell verbatim', () => {
    const result = renderNotebookMarkdown(
      [cell({ id: 'm1', type: 'markdown', source: '# Title\n\nSome text.' })],
      { includeOutputs: true }
    );
    expect(result.document).toBe('# Title\n\nSome text.');
    expect(result.cellCount).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('renders a code cell as a fenced python block', () => {
    const result = renderNotebookMarkdown([cell({ source: 'print(1)' })], {
      includeOutputs: true
    });
    expect(result.document).toBe('```python\nprint(1)\n```');
  });

  it('includes stream/text output as a fenced block when includeOutputs is true', () => {
    const result = renderNotebookMarkdown(
      [
        cell({
          source: 'print(1)',
          outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }]
        })
      ],
      { includeOutputs: true }
    );
    expect(result.document).toContain('```python\nprint(1)\n```');
    expect(result.document).toContain('```\n1\n');
  });

  it('omits outputs entirely when includeOutputs is false', () => {
    const result = renderNotebookMarkdown(
      [
        cell({
          source: 'print(1)',
          outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }]
        })
      ],
      { includeOutputs: false }
    );
    expect(result.document).toBe('```python\nprint(1)\n```');
  });

  it('renders an error output as a fenced traceback block', () => {
    const result = renderNotebookMarkdown(
      [
        cell({
          source: '1/0',
          outputs: [
            {
              output_type: 'error',
              ename: 'ZeroDivisionError',
              evalue: 'division by zero',
              traceback: ['line 1', 'line 2']
            }
          ]
        })
      ],
      { includeOutputs: true }
    );
    expect(result.document).toContain('ZeroDivisionError: division by zero');
    expect(result.document).toContain('line 1');
  });

  it('represents image output as a not-included placeholder, never embedded', () => {
    const base64 = 'a'.repeat(2000);
    const result = renderNotebookMarkdown(
      [
        cell({
          source: 'plot()',
          outputs: [
            {
              output_type: 'display_data',
              data: { 'image/png': base64 }
            }
          ]
        })
      ],
      { includeOutputs: true }
    );
    expect(result.document).toContain('![output](image/png,');
    expect(result.document).toContain('not included)');
    expect(result.document).not.toContain(base64);
  });

  it('bounds the rendered document to LIMITS.MAX_EXPORT_BYTES', () => {
    const huge = cell({ source: 'x'.repeat(LIMITS.MAX_EXPORT_BYTES * 2) });
    const result = renderNotebookMarkdown([huge], { includeOutputs: true });
    expect(result.truncated).toBe(true);
    expect(result.document.length).toBeLessThanOrEqual(LIMITS.MAX_EXPORT_BYTES);
  });

  it('reports truncated when more cells are given than LIMITS.MAX_EXPORT_CELLS', () => {
    const many = Array.from({ length: LIMITS.MAX_EXPORT_CELLS + 5 }, (_, i) =>
      cell({ id: `c${i}`, source: `x${i}` })
    );
    const result = renderNotebookMarkdown(many, { includeOutputs: false });
    expect(result.cellCount).toBe(LIMITS.MAX_EXPORT_CELLS);
    expect(result.truncated).toBe(true);
  });
});

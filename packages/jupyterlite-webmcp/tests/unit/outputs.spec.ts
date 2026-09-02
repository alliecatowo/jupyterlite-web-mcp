import {
  stripAnsi,
  boundText,
  htmlToText,
  serializeOutput,
  serializeOutputs,
  summarizeOutputs,
  fingerprintOutput
} from '../../src/jupyter/outputs';

describe('stripAnsi', () => {
  it('removes color escape sequences from a realistic traceback line', () => {
    const line =
      '\x1b[0;31m---------------------------------------------------------------------------\x1b[0m';
    expect(stripAnsi(line)).toBe(
      '---------------------------------------------------------------------------'
    );
  });

  it('removes ANSI codes embedded within text', () => {
    const line = '\x1b[1mBold\x1b[0m and \x1b[32mgreen\x1b[0m text';
    expect(stripAnsi(line)).toBe('Bold and green text');
  });
});

describe('boundText', () => {
  it('returns the input unchanged when under the limit', () => {
    const result = boundText('hello', 100);
    expect(result).toEqual({ text: 'hello', truncated: false });
  });

  it('truncates text over the byte limit and marks it truncated', () => {
    const text = 'x'.repeat(1000);
    const result = boundText(text, 50);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith('\n…[truncated]')).toBe(true);
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(50);
  });

  it('counts UTF-8 bytes, not UTF-16 code units, for multi-byte characters', () => {
    // 'é' is 1 UTF-16 unit but 2 UTF-8 bytes.
    const text = 'é'.repeat(200);
    const result = boundText(text, 50);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(50);
    // Sanity: if bytes were mis-counted as UTF-16 length, far more characters
    // would have survived than the byte budget actually allows.
    const survivingChars = result.text.replace('\n…[truncated]', '').length;
    expect(survivingChars).toBeLessThan(50);
  });

  it('handles a string of 3-byte characters (CJK) correctly', () => {
    const text = '日'.repeat(100); // '日' = 3 bytes in UTF-8
    const result = boundText(text, 50);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(50);
  });
});

describe('htmlToText', () => {
  it('converts a small table to readable text with no tags', () => {
    const html =
      '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
    const text = htmlToText(html);
    expect(text).not.toMatch(/<[^>]+>/);
    expect(text).toContain('a');
    expect(text).toContain('b');
    expect(text).toContain('c');
    expect(text).toContain('d');
  });

  it('strips a <script> block entirely, including its contents', () => {
    const html =
      '<div>before<script>alert("should not appear")</script>after</div>';
    const text = htmlToText(html);
    expect(text).not.toContain('alert');
    expect(text).not.toContain('should not appear');
    expect(text).toContain('before');
    expect(text).toContain('after');
  });

  it('decodes basic HTML entities', () => {
    const html = '<p>Tom &amp; Jerry &lt;3 &nbsp;friends&gt;</p>';
    const text = htmlToText(html);
    expect(text).toContain('Tom & Jerry');
    expect(text).toContain('<3');
    expect(text).toContain('friends>');
  });
});

describe('serializeOutput', () => {
  it('serializes a stream output whose text is a string array', () => {
    const output = {
      output_type: 'stream',
      name: 'stdout',
      text: ['line1\n', 'line2\n']
    };
    const result = serializeOutput(output);
    expect(result.outputType).toBe('stream');
    expect(result.name).toBe('stdout');
    expect(result.text).toBe('line1\nline2\n');
  });

  it('serializes an error output, joining and ANSI-stripping the traceback', () => {
    const output = {
      output_type: 'error',
      ename: 'ValueError',
      evalue: 'bad value',
      traceback: ['\x1b[0;31mTraceback\x1b[0m', 'ValueError: bad value']
    };
    const result = serializeOutput(output);
    expect(result.outputType).toBe('error');
    expect(result.ename).toBe('ValueError');
    expect(result.evalue).toBe('bad value');
    expect(result.traceback).toBe('Traceback\nValueError: bad value');
  });

  it('serializes an execute_result with text/plain and text/html', () => {
    const output = {
      output_type: 'execute_result',
      execution_count: 3,
      data: {
        'text/plain': '3',
        'text/html': '<b>3</b>'
      }
    };
    const result = serializeOutput(output);
    expect(result.outputType).toBe('execute_result');
    expect(result.executionCount).toBe(3);
    expect(result.text).toBe('3');
    expect(result.html).toBe('3');
  });

  it('references a display_data image/png payload without including its bytes', () => {
    const bigBase64 = 'A'.repeat(20000);
    const output = {
      output_type: 'display_data',
      data: {
        'image/png': bigBase64
      }
    };
    const result = serializeOutput(output);
    expect(result.outputType).toBe('display_data');
    expect(result.media).toEqual([
      {
        mimeType: 'image/png',
        bytes: Math.floor((bigBase64.length * 3) / 4),
        included: false
      }
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(bigBase64);
    expect(serialized.length).toBeLessThan(bigBase64.length);
  });
});

describe('serializeOutputs', () => {
  it('respects maxOutputs and reports omittedCount and truncated', () => {
    const outputs = Array.from({ length: 15 }, (_, i) => ({
      output_type: 'stream',
      name: 'stdout',
      text: `line${i}\n`
    }));
    const result = serializeOutputs(outputs, 5);
    expect(result.outputs).toHaveLength(5);
    expect(result.omittedCount).toBe(10);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when everything fits', () => {
    const outputs = [{ output_type: 'stream', name: 'stdout', text: 'hi\n' }];
    const result = serializeOutputs(outputs, 5);
    expect(result.omittedCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

describe('summarizeOutputs', () => {
  it('returns (no output) for an empty list', () => {
    expect(summarizeOutputs([])).toBe('(no output)');
  });

  it('prioritizes the error output in a mixed list', () => {
    const outputs = [
      { output_type: 'stream', name: 'stdout', text: 'some output\n' },
      {
        output_type: 'error',
        ename: 'ValueError',
        evalue: 'bad value',
        traceback: []
      }
    ];
    expect(summarizeOutputs(outputs)).toBe('error: ValueError: bad value');
  });
});

describe('fingerprintOutput', () => {
  it('is stable across differing key order', () => {
    const a = {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'text/plain': 'x' }
    };
    const b = {
      data: { 'text/plain': 'x' },
      execution_count: 1,
      output_type: 'execute_result'
    };
    expect(fingerprintOutput(a)).toBe(fingerprintOutput(b));
  });

  it('is unchanged when only execution_count differs', () => {
    const a = {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'text/plain': 'x' }
    };
    const b = {
      output_type: 'execute_result',
      execution_count: 2,
      data: { 'text/plain': 'x' }
    };
    expect(fingerprintOutput(a)).toBe(fingerprintOutput(b));
  });

  it('changes when the actual data changes', () => {
    const a = {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'text/plain': 'x' }
    };
    const b = {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'text/plain': 'y' }
    };
    expect(fingerprintOutput(a)).not.toBe(fingerprintOutput(b));
  });
});

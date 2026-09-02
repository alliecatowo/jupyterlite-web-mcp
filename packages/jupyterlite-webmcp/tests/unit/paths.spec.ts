import {
  validatePath,
  joinPath,
  basename,
  isNotebookPath
} from '../../src/jupyter/paths';
import { ToolError } from '../../src/jupyter/errors';

function expectInvalidPath(fn: () => unknown): void {
  try {
    fn();
    throw new Error('expected function to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe('INVALID_PATH');
  }
}

describe('validatePath', () => {
  it('accepts empty string, null, and undefined as the workspace root', () => {
    expect(validatePath('')).toBe('');
    expect(validatePath(null)).toBe('');
    expect(validatePath(undefined)).toBe('');
  });

  it('accepts a normal relative path', () => {
    expect(validatePath('a/b.ipynb')).toBe('a/b.ipynb');
  });

  it('normalizes ./ and duplicate/trailing slashes', () => {
    expect(validatePath('./a//b/')).toBe('a/b');
  });

  it('rejects an absolute path', () => {
    expectInvalidPath(() => validatePath('/etc/passwd'));
  });

  it('rejects parent traversal', () => {
    expectInvalidPath(() => validatePath('../secret'));
  });

  it('rejects parent traversal in the middle of a path', () => {
    expectInvalidPath(() => validatePath('a/../../b'));
  });

  it('rejects home-relative paths', () => {
    expectInvalidPath(() => validatePath('~/x'));
  });

  it('rejects a Windows drive-letter path', () => {
    expectInvalidPath(() => validatePath('C:/x'));
  });

  it('rejects a path containing a backslash', () => {
    expectInvalidPath(() => validatePath('a\\b'));
  });

  it('rejects a path containing a control character', () => {
    expectInvalidPath(() => validatePath('a' + String.fromCharCode(1) + 'b'));
  });

  it('rejects an overly long path', () => {
    expectInvalidPath(() => validatePath('a'.repeat(600)));
  });
});

describe('joinPath', () => {
  it('joins a directory and a name', () => {
    expect(joinPath('dir', 'file.ipynb')).toBe('dir/file.ipynb');
  });

  it('joins against the root', () => {
    expect(joinPath('', 'file.ipynb')).toBe('file.ipynb');
  });

  it('rejects a name containing a slash', () => {
    expectInvalidPath(() => joinPath('dir', 'a/b.ipynb'));
  });

  it('rejects an empty name', () => {
    expectInvalidPath(() => joinPath('dir', ''));
    expectInvalidPath(() => joinPath('dir', '   '));
  });
});

describe('basename', () => {
  it('returns the final path segment', () => {
    expect(basename('a/b/c.ipynb')).toBe('c.ipynb');
  });

  it('returns the whole string when there is no separator', () => {
    expect(basename('c.ipynb')).toBe('c.ipynb');
  });
});

describe('isNotebookPath', () => {
  it('is true for a .ipynb path', () => {
    expect(isNotebookPath('a/b.ipynb')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isNotebookPath('a/b.IPYNB')).toBe(true);
  });

  it('is false for a non-notebook path', () => {
    expect(isNotebookPath('a/b.txt')).toBe(false);
  });
});

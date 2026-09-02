import {
  ToolError,
  toolError,
  normalizeError,
  isAbortError
} from '../../src/jupyter/errors';

describe('ToolError', () => {
  it('carries code, message, and details', () => {
    const err = new ToolError('CELL_NOT_FOUND', 'no such cell', {
      cellId: 'abc'
    });
    expect(err.code).toBe('CELL_NOT_FOUND');
    expect(err.message).toBe('no such cell');
    expect(err.details).toEqual({ cellId: 'abc' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ToolError);
  });

  it('toJSON returns the expected shape', () => {
    const err = new ToolError('CELL_NOT_FOUND', 'no such cell', {
      cellId: 'abc'
    });
    expect(err.toJSON()).toEqual({
      cellId: 'abc',
      error: 'CELL_NOT_FOUND',
      message: 'no such cell'
    });
  });

  it('details cannot clobber error/message in toJSON', () => {
    const err = new ToolError('STALE_CELL', 'stale', {
      error: 'NOPE',
      message: 'NOPE'
    });
    const json = err.toJSON();
    expect(json.error).toBe('STALE_CELL');
    expect(json.message).toBe('stale');
  });

  it('toolError() constructs a ToolError instance', () => {
    const err = toolError('INVALID_ARGUMENT', 'bad arg');
    expect(err).toBeInstanceOf(ToolError);
    expect(err.code).toBe('INVALID_ARGUMENT');
    expect(err.details).toEqual({});
  });
});

describe('isAbortError', () => {
  it('is true for a ToolError with code ABORTED', () => {
    expect(isAbortError(new ToolError('ABORTED', 'stopped'))).toBe(true);
  });

  it('is false for a ToolError with another code', () => {
    expect(isAbortError(new ToolError('INTERNAL_ERROR', 'oops'))).toBe(false);
  });

  it('is true for a DOMException-like object named AbortError', () => {
    const abortLike = { name: 'AbortError' };
    expect(isAbortError(abortLike)).toBe(true);
  });

  it('is false for an object with a different name', () => {
    expect(isAbortError({ name: 'TypeError' })).toBe(false);
  });

  it('is false for null, undefined, and primitives', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });
});

describe('normalizeError', () => {
  it('maps an AbortError DOMException to ABORTED', () => {
    const err = new DOMException('aborted by user', 'AbortError');
    expect(normalizeError(err)).toEqual({
      error: 'ABORTED',
      message: 'The tool invocation was aborted.'
    });
  });

  it('maps a ToolError to its own toJSON()', () => {
    const err = new ToolError('PATH_EXISTS', 'already there', {
      path: 'a.ipynb'
    });
    expect(normalizeError(err)).toEqual(err.toJSON());
  });

  it('maps a plain Error to INTERNAL_ERROR with the message and no stack', () => {
    const err = new Error('something broke');
    const normalized = normalizeError(err);
    expect(normalized.error).toBe('INTERNAL_ERROR');
    expect(normalized.message).toBe('something broke');
    expect(normalized).not.toHaveProperty('stack');
    expect(Object.keys(normalized).sort()).toEqual(['error', 'message']);
  });

  it('truncates a very long message to 500 characters', () => {
    const longMessage = 'x'.repeat(5000);
    const err = new Error(longMessage);
    const normalized = normalizeError(err);
    expect(normalized.message).toHaveLength(500);
    expect(normalized.message).toBe('x'.repeat(500));
  });

  it('handles a non-Error string value', () => {
    expect(normalizeError('plain string failure')).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'plain string failure'
    });
  });

  it('handles a null value', () => {
    expect(normalizeError(null)).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'null'
    });
  });
});

import { toolError } from './errors';

/** Maximum accepted length of a workspace path. */
const MAX_PATH_LENGTH = 512;

/** Whether a string contains any ASCII control character. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Validate and normalize a workspace-relative path.
 *
 * The JupyterLite contents manager is rooted at the workspace, so every path a
 * tool accepts must stay inside it. Absolute paths, parent traversal, home
 * expansion, backslashes and control characters are rejected outright rather
 * than normalized away.
 *
 * @param path A workspace-relative path. `''`, `null` and `undefined` all mean
 *   the workspace root.
 * @returns The normalized path (no leading `./`, no duplicate or trailing `/`).
 */
export function validatePath(path: string | null | undefined): string {
  if (path === null || path === undefined) {
    return '';
  }
  if (typeof path !== 'string') {
    throw toolError('INVALID_PATH', 'The path must be a string.');
  }
  if (path.length > MAX_PATH_LENGTH) {
    throw toolError(
      'INVALID_PATH',
      `The path is longer than ${MAX_PATH_LENGTH} characters.`
    );
  }
  if (hasControlChars(path)) {
    throw toolError('INVALID_PATH', 'The path contains control characters.');
  }
  if (path.indexOf('\\') !== -1) {
    throw toolError(
      'INVALID_PATH',
      'The path contains a backslash. Use "/" as the separator.'
    );
  }
  if (path.charAt(0) === '/' || /^[a-zA-Z]:/.test(path)) {
    throw toolError(
      'INVALID_PATH',
      'The path must be relative to the workspace root.'
    );
  }
  if (path.charAt(0) === '~') {
    throw toolError('INVALID_PATH', 'Home-relative paths are not supported.');
  }

  const parts: string[] = [];
  const segments = path.split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      throw toolError(
        'INVALID_PATH',
        'The path escapes the workspace root ("..").'
      );
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/**
 * Join a validated directory and a single file name.
 *
 * @param directory Workspace-relative directory (`''` for the root).
 * @param name A file name; it may not contain a path separator.
 */
export function joinPath(directory: string, name: string): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw toolError('INVALID_PATH', 'A file name is required.');
  }
  if (name.indexOf('/') !== -1) {
    throw toolError(
      'INVALID_PATH',
      'The name must be a single file name without a directory separator.'
    );
  }
  const dir = validatePath(directory);
  return validatePath(dir ? `${dir}/${name}` : name);
}

/** Return the final segment of a path. */
export function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

/** Whether a path looks like a notebook. */
export function isNotebookPath(path: string): boolean {
  return /\.ipynb$/i.test(path);
}

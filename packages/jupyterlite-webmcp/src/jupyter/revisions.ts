/**
 * Deterministic, non-cryptographic hashing helpers used to fingerprint cell
 * source and to compute a cheap "revision" token for a whole notebook, so
 * tools can detect when a cell or notebook has changed underneath them
 * without keeping a copy of the previous content around.
 */

const OFFSET_BASIS_A = 0x811c9dc5;
const OFFSET_BASIS_B = 0x01000193;
const FNV_PRIME = 0x01000193;

function fnv1a32(input: string, offsetBasis: number): number {
  let hash = offsetBasis;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function toHex8(n: number): string {
  const hex = (n >>> 0).toString(16);
  return '0'.repeat(8 - hex.length) + hex;
}

/**
 * Computes a deterministic, non-cryptographic 16-character lowercase hex
 * digest of `input`, stable across runs and platforms. Implemented as two
 * independent 32-bit FNV-1a passes (with different offset bases) over the
 * string's UTF-16 code units, each folded to 8 hex characters and
 * concatenated. Not suitable for security purposes, only for cheap change
 * detection and fingerprinting.
 */
export function stableHash(input: string): string {
  const a = fnv1a32(input, OFFSET_BASIS_A);
  const b = fnv1a32(input, OFFSET_BASIS_B);
  return toHex8(a) + toHex8(b);
}

/**
 * Hashes a single cell's identity-relevant content: its type and source.
 * Used as a building block for detecting whether a specific cell's content
 * has changed.
 */
export function hashCellSource(cellType: string, source: string): string {
  return stableHash(cellType + ' ' + source);
}

/**
 * Minimal shape of a cell needed to include it in a notebook revision
 * computation.
 */
export interface ICellHashInput {
  id: string;
  cellType: string;
  source: string;
}

/**
 * Computes a stable revision token (`rev_<16 hex chars>`) summarizing an
 * entire notebook's cell ids, types, and sources, in order. Any change to a
 * cell's id, type, source, or the order/count of cells changes the result.
 */
export function computeNotebookRevision(cells: ICellHashInput[]): string {
  const joined = cells
    .map(c => c.id + ':' + c.cellType + ':' + hashCellSource(c.cellType, c.source))
    .join('\n');
  return 'rev_' + stableHash(joined);
}

/**
 * Serializes nbformat cell outputs into bounded, agent-safe JSON. Kept free
 * of any `@jupyterlab/*` dependency: outputs are typed as
 * `Record<string, unknown>` rather than imported nbformat types, so this
 * module has zero runtime imports.
 */
import { stableHash } from './revisions';
import { LIMITS } from '../limits';

/**
 * A reference to a non-text output payload (an image, PDF, or other binary
 * media) that was deliberately not included in a serialized output, along
 * with its declared mime type and an estimated decoded byte size.
 */
export interface IMediaRef {
  mimeType: string;
  bytes: number;
  included: false;
}

/**
 * A single nbformat output reduced to a small, bounded, JSON-safe shape
 * suitable for returning to an LLM agent.
 */
export interface ISerializedOutput {
  outputType: string;
  name?: string;
  text?: string;
  html?: string;
  executionCount?: number | null;
  ename?: string;
  evalue?: string;
  traceback?: string;
  media?: IMediaRef[];
  truncated?: boolean;
}

/**
 * The result of serializing a list of outputs: the (possibly truncated)
 * serialized outputs, whether anything was truncated or omitted, and how
 * many outputs were omitted entirely because of the `maxOutputs` cap.
 */
export interface ISerializedOutputs {
  outputs: ISerializedOutput[];
  truncated: boolean;
  omittedCount: number;
}

/**
 * Removes ANSI CSI/SGR escape sequences (e.g. color codes) from `text`,
 * returning the plain text a human or agent would actually read.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function utf8Length(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
        continue;
      }
    }
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Bounds `text` to at most `maxBytes` of UTF-8, measuring real UTF-8 byte
 * length (not UTF-16 character count). Returns the text unchanged when it
 * already fits; otherwise slices on character (and surrogate-pair)
 * boundaries so the result fits the budget and appends a `'\n…[truncated]'`
 * marker.
 */
export function boundText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (utf8Length(text) <= maxBytes) {
    return { text, truncated: false };
  }
  const suffix = '\n…[truncated]';
  const suffixBytes = utf8Length(suffix);
  const budget = Math.max(0, maxBytes - suffixBytes);
  let bytes = 0;
  let result = '';
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    let charLen = 1;
    let byteLen: number;
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        charLen = 2;
        byteLen = 4;
      } else {
        byteLen = 3;
      }
    } else if (code < 0x80) {
      byteLen = 1;
    } else if (code < 0x800) {
      byteLen = 2;
    } else {
      byteLen = 3;
    }
    if (bytes + byteLen > budget) {
      break;
    }
    bytes += byteLen;
    result += text.substr(i, charLen);
    i += charLen;
  }
  return { text: result + suffix, truncated: true };
}

const BASIC_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
};

/**
 * Converts a fragment of HTML into plain, human-readable text: drops
 * `<script>`/`<style>` blocks entirely, turns block-ish tags into line/tab
 * breaks, strips all remaining tags, decodes the handful of basic HTML
 * entities, collapses long runs of blank lines, and trims the result.
 */
export function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/td>/gi, '\t');
  text = text.replace(/<\/th>/gi, '\t');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, m => BASIC_ENTITIES[m]);
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function joinIfArray(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('');
  }
  return typeof value === 'string' ? value : '';
}

function isBase64Media(mimeType: string, value: string): boolean {
  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    return true;
  }
  return value.length > 1024;
}

/**
 * Serializes one raw nbformat output object into a bounded
 * {@link ISerializedOutput}, dispatching on its `output_type`. Text fields
 * are ANSI-stripped and bounded to `maxTextBytes`; image/PDF/large-base64
 * payloads are never included, only referenced via {@link IMediaRef}.
 */
export function serializeOutput(
  output: unknown,
  maxTextBytes: number = LIMITS.MAX_TEXT_OUTPUT_BYTES
): ISerializedOutput {
  const o = (output ?? {}) as Record<string, unknown>;
  const outputType = o.output_type;

  if (outputType === 'stream') {
    const bounded = boundText(stripAnsi(joinIfArray(o.text)), maxTextBytes);
    const result: ISerializedOutput = {
      outputType: 'stream',
      text: bounded.text
    };
    if (typeof o.name === 'string') {
      result.name = o.name;
    }
    if (bounded.truncated) {
      result.truncated = true;
    }
    return result;
  }

  if (outputType === 'error') {
    const traceback = Array.isArray(o.traceback) ? (o.traceback as unknown[]) : [];
    const bounded = boundText(stripAnsi(traceback.map(String).join('\n')), maxTextBytes);
    const result: ISerializedOutput = {
      outputType: 'error',
      ename: typeof o.ename === 'string' ? o.ename : '',
      evalue: typeof o.evalue === 'string' ? o.evalue : '',
      traceback: bounded.text
    };
    if (bounded.truncated) {
      result.truncated = true;
    }
    return result;
  }

  if (outputType === 'execute_result' || outputType === 'display_data') {
    const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
    const result: ISerializedOutput = { outputType: outputType as string };
    let truncatedAny = false;

    if (typeof data['text/plain'] !== 'undefined') {
      const bounded = boundText(stripAnsi(joinIfArray(data['text/plain'])), maxTextBytes);
      result.text = bounded.text;
      truncatedAny = truncatedAny || bounded.truncated;
    }

    if (typeof data['text/html'] !== 'undefined') {
      const bounded = boundText(htmlToText(joinIfArray(data['text/html'])), Math.floor(maxTextBytes / 2));
      result.html = bounded.text;
      truncatedAny = truncatedAny || bounded.truncated;
    }

    const media: IMediaRef[] = [];
    for (const mimeType of Object.keys(data)) {
      if (mimeType === 'text/plain' || mimeType === 'text/html') {
        continue;
      }
      const value = data[mimeType];
      if (typeof value === 'string' && isBase64Media(mimeType, value)) {
        media.push({
          mimeType,
          bytes: Math.floor((value.length * 3) / 4),
          included: false
        });
      }
    }
    if (media.length > 0) {
      result.media = media;
    }

    if (outputType === 'execute_result') {
      result.executionCount = typeof o.execution_count === 'number' ? o.execution_count : null;
    }

    if (truncatedAny) {
      result.truncated = true;
    }
    return result;
  }

  return { outputType: String(outputType ?? 'unknown') };
}

/**
 * Serializes a list of raw outputs, keeping at most `maxOutputs` of them
 * (defaulting to {@link LIMITS.MAX_OUTPUTS_PER_CELL}) and bounding each
 * one's text to `maxTextBytes` (defaulting to
 * {@link LIMITS.MAX_TEXT_OUTPUT_BYTES}). Reports how many outputs were
 * omitted and whether anything was truncated or omitted.
 */
export function serializeOutputs(
  outputs: unknown[],
  maxOutputs: number = LIMITS.MAX_OUTPUTS_PER_CELL,
  maxTextBytes: number = LIMITS.MAX_TEXT_OUTPUT_BYTES
): ISerializedOutputs {
  const kept = outputs.slice(0, maxOutputs).map(o => serializeOutput(o, maxTextBytes));
  const omittedCount = Math.max(0, outputs.length - maxOutputs);
  const truncated = omittedCount > 0 || kept.some(o => o.truncated === true);
  return { outputs: kept, truncated, omittedCount };
}

/**
 * Produces a single short, human-readable summary of a cell's raw outputs,
 * bounded to `maxChars` characters (defaulting to
 * {@link LIMITS.MAX_SUMMARY_CHARS}). Errors take priority over stream/text
 * content; when there is neither an error nor any text, falls back to a
 * `'<N output(s): mime, mime>'` style summary. Returns `'(no output)'` for
 * an empty list.
 */
export function summarizeOutputs(outputs: unknown[], maxChars: number = LIMITS.MAX_SUMMARY_CHARS): string {
  if (outputs.length === 0) {
    return '(no output)';
  }

  for (const raw of outputs) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (o.output_type === 'error') {
      const ename = typeof o.ename === 'string' ? o.ename : '';
      const evalue = typeof o.evalue === 'string' ? o.evalue : '';
      return truncateChars(`error: ${ename}: ${evalue}`, maxChars);
    }
  }

  const textParts: string[] = [];
  const labels: string[] = [];
  for (const raw of outputs) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (o.output_type === 'stream') {
      const text = stripAnsi(joinIfArray(o.text)).trim();
      if (text) {
        textParts.push(text);
      }
      labels.push('stream');
    } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
      const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
      const plain = typeof data['text/plain'] !== 'undefined' ? stripAnsi(joinIfArray(data['text/plain'])).trim() : '';
      if (plain) {
        textParts.push(plain);
      }
      const mimeKeys = Object.keys(data);
      const nonPlain = mimeKeys.find(k => k !== 'text/plain');
      labels.push(nonPlain ?? mimeKeys[0] ?? 'unknown');
    } else {
      labels.push(String(o.output_type ?? 'unknown'));
    }
  }

  const joined = textParts.join(' ').trim();
  if (joined) {
    return truncateChars(joined, maxChars);
  }

  return truncateChars(`<${outputs.length} output(s): ${labels.join(', ')}>`, maxChars);
}

function truncateChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}

function prepareForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prepareForFingerprint);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (key === 'execution_count') {
        continue;
      }
      if (key === 'data' && obj[key] && typeof obj[key] === 'object') {
        const bundle = obj[key] as Record<string, unknown>;
        const newBundle: Record<string, unknown> = {};
        for (const mimeType of Object.keys(bundle)) {
          const v = bundle[mimeType];
          if (typeof v === 'string' && isBase64Media(mimeType, v)) {
            newBundle[mimeType] = mimeType + ':' + v.length;
          } else {
            newBundle[mimeType] = prepareForFingerprint(v);
          }
        }
        result[key] = newBundle;
      } else {
        result[key] = prepareForFingerprint(obj[key]);
      }
    }
    return result;
  }
  return value;
}

/**
 * Computes a stable, order-independent fingerprint of a single raw output,
 * suitable for detecting whether an output has changed. Volatile fields
 * (`execution_count`) are removed, image/binary payloads are represented
 * only by their mime type and length (never hashed by content), and object
 * keys are sorted recursively before hashing so key order never affects the
 * result.
 */
export function fingerprintOutput(output: unknown): string {
  const prepared = prepareForFingerprint(output ?? {});
  return stableHash(JSON.stringify(sortKeys(prepared)));
}

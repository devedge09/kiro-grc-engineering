/**
 * yaml-shim.mjs — drop-in replacement for js-yaml's load() and loadAll()
 * using only Node.js built-ins (no npm required).
 *
 * Supports the YAML subset used by this toolkit:
 *   - Block mappings and sequences
 *   - Flow mappings {} and sequences []
 *   - Quoted strings (single and double)
 *   - Block scalars (| literal, > folded)
 *   - Comments (#)
 *   - Booleans, integers, floats, null
 *   - Multi-document streams (---)
 *
 * Usage (import as named or default):
 *   import yaml from './yaml-shim.mjs';
 *   import { load, loadAll } from './yaml-shim.mjs';
 */

/**
 * Parse a single YAML document string into a JS value.
 * @param {string} src
 * @returns {any}
 */
export function load(src) {
  if (typeof src !== 'string') return null;
  const lines = src.split('\n');
  const [result] = parseValue(lines, 0, -1);
  return result;
}

/**
 * Parse a multi-document YAML stream (separated by ---).
 * @param {string} src
 * @returns {any[]}
 */
export function loadAll(src) {
  if (typeof src !== 'string') return [];
  const docs = src.split(/^---[ \t]*$/m);
  return docs
    .map(d => d.trim())
    .filter(d => d.length > 0)
    .map(d => load(d));
}

export default { load, loadAll };

// ─── Internal parser ─────────────────────────────────────────────────────────

function parseValue(lines, startIdx, parentIndent) {
  const idx = skipEmptyAndComments(lines, startIdx);
  if (idx >= lines.length) return [null, idx];

  const line = lines[idx];
  const indent = getIndent(line);
  if (parentIndent >= 0 && indent <= parentIndent) return [null, idx];

  const trimmed = line.trim();

  if (trimmed.startsWith('- ') || trimmed === '-') {
    return parseBlockSequence(lines, idx, indent);
  }
  if (/^[^:]+:/.test(trimmed) && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return parseBlockMapping(lines, idx, indent);
  }
  if (trimmed === '|' || trimmed === '>') {
    return parseBlockScalar(lines, idx, trimmed === '|');
  }
  return [parseScalar(trimmed), idx + 1];
}

function parseBlockSequence(lines, startIdx, seqIndent) {
  const result = [];
  let i = startIdx;
  while (i < lines.length) {
    i = skipEmptyAndComments(lines, i);
    if (i >= lines.length) break;
    const line = lines[i];
    const indent = getIndent(line);
    if (indent < seqIndent) break;
    if (indent > seqIndent) { i++; continue; }
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) break;

    const afterDash = trimmed.slice(1).trim();
    if (afterDash === '') {
      const [val, nextI] = parseValue(lines, i + 1, seqIndent);
      result.push(val);
      i = nextI;
    } else if (afterDash === '|' || afterDash === '>') {
      const [val, nextI] = parseBlockScalar(lines, i, afterDash === '|');
      result.push(val);
      i = nextI;
    } else if (/^[^:]+:/.test(afterDash) && !afterDash.startsWith('{')) {
      const childIndent = seqIndent + 2;
      const fakeLines = [' '.repeat(childIndent) + afterDash, ...lines.slice(i + 1)];
      const [val, relI] = parseBlockMapping(fakeLines, 0, childIndent);
      result.push(val);
      i = i + 1 + (relI - 1);
    } else {
      result.push(parseScalar(afterDash));
      i++;
    }
  }
  return [result, i];
}

function parseBlockMapping(lines, startIdx, mapIndent) {
  const result = {};
  let i = startIdx;
  while (i < lines.length) {
    i = skipEmptyAndComments(lines, i);
    if (i >= lines.length) break;
    const line = lines[i];
    const indent = getIndent(line);
    if (indent < mapIndent) break;
    if (indent > mapIndent) { i++; continue; }

    const trimmed = line.trim();
    const colonIdx = findMappingColon(trimmed);
    if (colonIdx < 0) break;

    const key = unquote(trimmed.slice(0, colonIdx).trim());
    const afterColon = trimmed.slice(colonIdx + 1).trim();

    if (afterColon === '') {
      const [val, nextI] = parseValue(lines, i + 1, mapIndent);
      result[key] = val;
      i = nextI;
    } else if (afterColon === '|' || afterColon === '>') {
      const [val, nextI] = parseBlockScalar(lines, i, afterColon === '|');
      result[key] = val;
      i = nextI;
    } else if (afterColon.startsWith('-')) {
      const childIndent = mapIndent + 2;
      const fakeLines = [' '.repeat(childIndent) + afterColon, ...lines.slice(i + 1)];
      const [val, relI] = parseBlockSequence(fakeLines, 0, childIndent);
      result[key] = val;
      i = i + 1 + (relI - 1);
    } else {
      result[key] = parseScalar(afterColon);
      i++;
    }
  }
  return [result, i];
}

function parseBlockScalar(lines, startIdx, literal) {
  let i = startIdx + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return ['', i];

  const contentIndent = getIndent(lines[i]);
  const parts = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { parts.push(''); i++; continue; }
    if (getIndent(line) < contentIndent) break;
    parts.push(line.slice(contentIndent));
    i++;
  }
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const joined = literal ? parts.join('\n') : parts.join(' ').replace(/  +/g, ' ');
  return [joined, i];
}

function parseScalar(s) {
  if (s === null || s === undefined) return null;
  s = s.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === 'no' || s === 'off') return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return unquote(s);
  if (s.startsWith('[')) { try { return JSON.parse(s.replace(/'/g, '"')); } catch { return s; } }
  if (s.startsWith('{')) { try { return JSON.parse(s.replace(/'/g, '"')); } catch { return s; } }
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) { const n = Number(s); if (!Number.isNaN(n)) return n; }
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s, 8);
  return s;
}

function unquote(s) {
  if (!s) return s;
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function findMappingColon(s) {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ':' && !inSingle && !inDouble) {
      if (i + 1 >= s.length || s[i + 1] === ' ' || s[i + 1] === '\t') return i;
    }
  }
  return -1;
}

function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function skipEmptyAndComments(lines, i) {
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t !== '' && !t.startsWith('#')) return i;
    i++;
  }
  return i;
}

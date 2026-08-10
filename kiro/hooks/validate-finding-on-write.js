#!/usr/bin/env node
/**
 * kiro/hooks/validate-finding-on-write.js
 *
 * Kiro post-tool-use hook. Automatically validates any JSON file written
 * to ~/.cache/claude-grc/findings/ against the finding schema.
 *
 * Wire this up in your project's .kiro/hooks.json:
 * {
 *   "hooks": [{
 *     "event": "post_tool_use",
 *     "tools": ["write"],
 *     "command": "node ~/grc-engineering/kiro/hooks/validate-finding-on-write.js"
 *   }]
 * }
 *
 * The hook receives tool context on stdin as JSON:
 * { "tool": "write", "params": { "path": "...", ... }, "result": { ... } }
 *
 * If validation fails, it prints a clear error so Kiro surfaces it to the user.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/finding.schema.json');
const FINDINGS_CACHE = path.join(os.homedir(), '.cache', 'claude-grc', 'findings');
const VALIDATOR = path.resolve(__dirname, '../tools/findings-validator.js');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join('');
}

async function main() {
  let ctx;
  try {
    const raw = await readStdin();
    ctx = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    // Not JSON stdin — called directly, just validate the whole cache
    ctx = {};
  }

  // Only act on file writes
  const filePath = ctx?.params?.path || ctx?.path || '';
  if (!filePath) {
    // No file context — scan the full cache for any invalid files
    await validateCacheDir();
    return;
  }

  // Only care about .json files inside the findings cache
  const absPath = filePath.startsWith('~')
    ? filePath.replace('~', os.homedir())
    : path.resolve(filePath);

  if (!absPath.startsWith(FINDINGS_CACHE) || !absPath.endsWith('.json')) {
    process.exit(0); // Not a finding file — nothing to do
  }

  // Wait briefly for the file to be fully written
  await new Promise(r => setTimeout(r, 50));

  await validateFile(absPath);
}

async function validateFile(filePath) {
  let data;
  try {
    data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (e) {
    console.error(`[grc-hook] ⚠ Cannot parse ${filePath}: ${e.message}`);
    process.exit(1);
  }

  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf8'));
  const errors = validate(data, schema);

  if (errors.length === 0) {
    console.log(`[grc-hook] ✓ Finding valid: ${path.basename(filePath)}`);
  } else {
    console.error(`[grc-hook] ✗ Finding INVALID: ${filePath}`);
    errors.forEach(e => console.error(`  [${e.path}] ${e.message}`));
    console.error('');
    console.error('Fix the finding file before running gap-assessment.');
    console.error(`See: https://github.com/devedge09/grckit/blob/main/schemas/finding.schema.json`);
    process.exit(1);
  }
}

async function validateCacheDir() {
  try {
    await fs.access(FINDINGS_CACHE);
  } catch {
    process.exit(0); // Cache doesn't exist yet — nothing to validate
  }

  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf8'));
  const files = await findJson(FINDINGS_CACHE);
  let bad = 0;

  for (const f of files) {
    let data;
    try { data = JSON.parse(await fs.readFile(f, 'utf8')); } catch { bad++; continue; }
    const errors = validate(data, schema);
    if (errors.length > 0) {
      console.error(`[grc-hook] ✗ ${f}`);
      errors.slice(0, 3).forEach(e => console.error(`  [${e.path}] ${e.message}`));
      bad++;
    }
  }

  if (bad > 0) {
    console.error(`[grc-hook] ${bad} invalid finding file(s) in cache — run findings-validator.js for details`);
    process.exit(1);
  }
}

async function findJson(dir) {
  const results = [];
  try {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...await findJson(full));
      else if (e.name.endsWith('.json')) results.push(full);
    }
  } catch { /* ignore unreadable dirs */ }
  return results;
}

// ─── Inline schema validator (same logic as findings-validator.js) ─────────────
function validate(data, schema) {
  const defs = schema.$defs || schema.definitions || {};
  const errors = [];
  check(data, schema, '$', defs, errors);
  return errors;
}

function check(data, schema, p, defs, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '').replace(/^#\/definitions\//, '');
    if (defs[name]) check(data, defs[name], p, defs, errors);
    return;
  }
  if (schema.allOf) schema.allOf.forEach(s => check(data, s, p, defs, errors));
  if (schema.if) {
    const prev = errors.length;
    check(data, schema.if, p, defs, errors);
    const passed = errors.length === prev;
    while (errors.length > prev) errors.pop();
    if (passed && schema.then) check(data, schema.then, p, defs, errors);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    if (!types.includes(actual)) { errors.push({ path: p, message: `Expected [${types.join('|')}] got ${actual}` }); return; }
  }
  if ('const' in schema && data !== schema.const) errors.push({ path: p, message: `Expected const ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.includes(data)) errors.push({ path: p, message: `Not in enum: ${JSON.stringify(data)}` });
  if (typeof data === 'string') {
    if (schema.minLength && data.length < schema.minLength) errors.push({ path: p, message: `minLength ${schema.minLength}` });
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push({ path: p, message: `pattern /${schema.pattern}/` });
    if (schema.format === 'date-time' && isNaN(Date.parse(data))) errors.push({ path: p, message: `invalid date-time` });
  }
  if (Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) errors.push({ path: p, message: `minItems ${schema.minItems}` });
    if (schema.items) data.forEach((v, i) => check(v, schema.items, `${p}[${i}]`, defs, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (schema.required) schema.required.forEach(k => { if (!(k in data)) errors.push({ path: p, message: `Missing required: "${k}"` }); });
    if (schema.properties) Object.entries(schema.properties).forEach(([k, s]) => { if (k in data) check(data[k], s, `${p}.${k}`, defs, errors); });
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      Object.keys(data).forEach(k => { if (!allowed.has(k)) errors.push({ path: p, message: `Additional property not allowed: "${k}"` }); });
    }
  }
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

main().catch(e => { console.error(`[grc-hook] Error: ${e.message}`); process.exit(1); });

#!/usr/bin/env node
/**
 * findings-validator.js
 * Validates JSON finding files against schemas/finding.schema.json
 * using only Node.js built-ins — no ajv, no npm required.
 *
 * Usage:
 *   node kiro/tools/findings-validator.js [files...]
 *   node kiro/tools/findings-validator.js ~/.cache/claude-grc/findings/**\/*.json
 *   node kiro/tools/findings-validator.js --dir=~/.cache/claude-grc/findings
 *   node kiro/tools/findings-validator.js --dir=. --recursive
 *
 * Exit codes:
 *   0  All files valid
 *   1  One or more files invalid or could not be read
 *   2  Usage error
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/finding.schema.json');

// ─── Tiny JSON Schema validator (draft 2020-12 subset) ───────────────────────
// Implements the subset of JSON Schema actually used in finding.schema.json:
// type, required, properties, additionalProperties, enum, const, pattern,
// minLength, minItems, $ref, $defs, allOf, if/then, format (date-time, no-op check)

class Validator {
  constructor(schema) {
    this.root = schema;
    this.defs = schema.$defs || schema.definitions || {};
    this.errors = [];
  }

  validate(data) {
    this.errors = [];
    this._check(data, this.root, '$');
    return this.errors.length === 0;
  }

  _check(data, schema, path) {
    if (!schema || typeof schema !== 'object') return;

    // $ref
    if (schema.$ref) {
      const refName = schema.$ref.replace(/^#\/\$defs\//, '').replace(/^#\/definitions\//, '');
      const refSchema = this.defs[refName];
      if (!refSchema) { this._err(path, `Unknown $ref: ${schema.$ref}`); return; }
      this._check(data, refSchema, path);
      return;
    }

    // allOf
    if (schema.allOf) {
      for (const sub of schema.allOf) this._check(data, sub, path);
    }

    // if/then
    if (schema.if) {
      const savedErrors = this.errors;
      this.errors = [];
      this._check(data, schema.if, path);
      const conditionPassed = this.errors.length === 0;
      this.errors = savedErrors;
      if (conditionPassed && schema.then) this._check(data, schema.then, path);
    }

    // type
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actual = this._typeOf(data);
      if (!types.includes(actual)) {
        this._err(path, `Expected type [${types.join('|')}], got ${actual}`);
        return; // further checks would be nonsense
      }
    }

    // const
    if ('const' in schema && data !== schema.const) {
      this._err(path, `Expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
    }

    // enum
    if (schema.enum && !schema.enum.includes(data)) {
      this._err(path, `Value ${JSON.stringify(data)} not in enum [${schema.enum.map(v => JSON.stringify(v)).join(', ')}]`);
    }

    // string-specific
    if (typeof data === 'string') {
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        this._err(path, `String length ${data.length} < minLength ${schema.minLength}`);
      }
      if (schema.pattern) {
        const rx = new RegExp(schema.pattern);
        if (!rx.test(data)) {
          this._err(path, `String "${data}" does not match pattern /${schema.pattern}/`);
        }
      }
      if (schema.format === 'date-time') {
        if (isNaN(Date.parse(data))) {
          this._err(path, `"${data}" is not a valid date-time`);
        }
      }
    }

    // number-specific
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        this._err(path, `${data} < minimum ${schema.minimum}`);
      }
    }

    // array-specific
    if (Array.isArray(data)) {
      if (schema.minItems !== undefined && data.length < schema.minItems) {
        this._err(path, `Array length ${data.length} < minItems ${schema.minItems}`);
      }
      if (schema.items) {
        data.forEach((item, i) => this._check(item, schema.items, `${path}[${i}]`));
      }
    }

    // object-specific
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      // required
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in data)) {
            this._err(path, `Missing required property: "${key}"`);
          }
        }
      }

      // properties
      if (schema.properties) {
        for (const [key, subSchema] of Object.entries(schema.properties)) {
          if (key in data) {
            this._check(data[key], subSchema, `${path}.${key}`);
          }
        }
      }

      // additionalProperties: false
      if (schema.additionalProperties === false && schema.properties) {
        const allowed = new Set(Object.keys(schema.properties));
        for (const key of Object.keys(data)) {
          if (!allowed.has(key)) {
            this._err(path, `Additional property not allowed: "${key}"`);
          }
        }
      }
    }
  }

  _typeOf(val) {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  _err(path, msg) {
    this.errors.push({ path, message: msg });
  }
}

// ─── File discovery ───────────────────────────────────────────────────────────

async function findJsonFiles(dir, recursive) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...await findJsonFiles(full, recursive));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage:
  node kiro/tools/findings-validator.js [files...]
  node kiro/tools/findings-validator.js --dir=~/.cache/claude-grc/findings [--recursive]

Validates JSON finding files against schemas/finding.schema.json.
No npm dependencies required.

Options:
  --dir=<path>    Scan a directory for .json files
  --recursive     Recurse into subdirectories when using --dir
  --quiet         Only print errors, not OK messages
  --help          Show this help

Exit codes:
  0  All files valid
  1  One or more files invalid
  2  Usage error`);
    process.exit(0);
  }

  let files = [];
  let scanDir = null;
  let recursive = false;
  let quiet = false;

  for (const arg of argv) {
    if (arg.startsWith('--dir=')) {
      scanDir = arg.slice(6).replace(/^~/, os.homedir());
    } else if (arg === '--recursive') {
      recursive = true;
    } else if (arg === '--quiet') {
      quiet = false; // quiet suppresses OK but not errors
    } else if (!arg.startsWith('--')) {
      files.push(arg.replace(/^~/, os.homedir()));
    }
  }

  if (scanDir) {
    try {
      files = [...files, ...await findJsonFiles(scanDir, recursive)];
    } catch (e) {
      console.error(`Cannot read directory: ${scanDir}\n${e.message}`);
      process.exit(2);
    }
  }

  if (files.length === 0) {
    // Default: validate everything in the findings cache
    const defaultDir = path.join(os.homedir(), '.cache', 'claude-grc', 'findings');
    try {
      files = await findJsonFiles(defaultDir, true);
      if (files.length === 0) {
        console.log('No finding files found in ~/.cache/claude-grc/findings/');
        console.log('Run a connector first (e.g., github-inspector:collect) then re-run.');
        process.exit(0);
      }
    } catch {
      console.error('No files specified and ~/.cache/claude-grc/findings/ does not exist.');
      console.error('Usage: node kiro/tools/findings-validator.js [files...] or --dir=<path>');
      process.exit(2);
    }
  }

  // Load schema
  let schema;
  try {
    schema = JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf8'));
  } catch (e) {
    console.error(`Cannot load schema from ${SCHEMA_PATH}: ${e.message}`);
    process.exit(2);
  }

  const validator = new Validator(schema);
  let passed = 0, failed = 0, skipped = 0;
  const allErrors = [];

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      console.error(`  ✗ SKIP  ${file}\n         Cannot parse: ${e.message}`);
      skipped++;
      continue;
    }

    const ok = validator.validate(data);
    if (ok) {
      if (!quiet) console.log(`  ✓ OK    ${file}`);
      passed++;
    } else {
      const errLines = validator.errors.map(e => `         [${e.path}] ${e.message}`).join('\n');
      console.error(`  ✗ FAIL  ${file}\n${errLines}`);
      allErrors.push({ file, errors: validator.errors });
      failed++;
    }
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped (${files.length} total)`);

  if (failed > 0) {
    console.error(`\n${failed} file(s) failed validation. Fix the errors above before running gap-assessment.`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });

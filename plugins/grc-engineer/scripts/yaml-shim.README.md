# yaml-shim.mjs

A zero-dependency YAML parser for Node.js ESM. Drop-in replacement for
[`js-yaml`](https://github.com/nodeca/js-yaml)'s `load()` and `loadAll()`.

Written as part of the [kiro-grc-engineering](https://github.com/devedge09/kiro-grc-engineering) project
to run the GRC Engineering toolkit in environments where npm packages are unavailable.

## Usage

```js
import yaml from './yaml-shim.mjs';
// or named imports:
import { load, loadAll } from './yaml-shim.mjs';

const data = yaml.load(`
name: my-service
tags:
  - soc2
  - nist
enabled: true
`);
// → { name: 'my-service', tags: ['soc2', 'nist'], enabled: true }

const docs = yaml.loadAll(`
---
id: finding-1
---
id: finding-2
`);
// → [{ id: 'finding-1' }, { id: 'finding-2' }]
```

## Supported YAML features

| Feature | Supported |
|---|---|
| Block mappings | ✓ |
| Block sequences | ✓ |
| Flow mappings `{}` | ✓ (via JSON.parse) |
| Flow sequences `[]` | ✓ (via JSON.parse) |
| Double-quoted strings | ✓ (with `\"`, `\\`, `\n`, `\t` escapes) |
| Single-quoted strings | ✓ (with `''` escape) |
| Block scalars `\|` literal | ✓ |
| Block scalars `>` folded | ✓ |
| Comments `#` | ✓ |
| Multi-document streams `---` | ✓ |
| Booleans (`true`/`false`/`yes`/`no`) | ✓ |
| Integers and floats | ✓ |
| Hex (`0x...`) and octal (`0o...`) | ✓ |
| Null (`null`, `~`, empty) | ✓ |
| Anchors and aliases `&` / `*` | ✗ |
| Merge keys `<<` | ✗ |
| Complex tags `!!` | ✗ |
| Multiline flow scalars | ✗ |

The unsupported features are not used in this toolkit's YAML configs. If you need full YAML
compliance, use [js-yaml](https://github.com/nodeca/js-yaml).

## Requirements

Node.js 18+ (ESM). No npm, no dependencies, no build step.

## License

MIT — same as the containing repository.

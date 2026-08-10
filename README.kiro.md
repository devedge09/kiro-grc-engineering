# kiro-grc-engineering

GRC Engineering toolkit ported for [Kiro](https://kiro.dev) — the AI agent IDE.

This is a fork of [GRCEngClub/claude-grc-engineering](https://github.com/GRCEngClub/claude-grc-engineering) with changes that make the entire toolkit run inside Kiro CLI without any npm dependencies.

## What changed from upstream

The original toolkit required `js-yaml`, `dotenv`, and `@octokit/rest` from npm. In restricted environments (like Kiro CLI's sandbox) the npm registry is blocked. This fork removes those dependencies entirely:

| Original | Replacement |
|---|---|
| `js-yaml` | `yaml-shim.mjs` — zero-dependency YAML parser using Node built-ins |
| `dotenv` | Inline `.env` reader using `fs/promises` |
| `@octokit/rest` | `gh` CLI calls via `execSync` |
| CJS `require()` in 3 scripts | ESM `import` (required by `"type": "module"`) |

Everything runs on **Node 22 built-ins alone** — `npm install` is not needed.

## Kiro integration

The toolkit integrates with Kiro via:

- `~/.kiro/steering/grc-engineering.md` — loaded into every Kiro session automatically
- `~/.kiro/agents/grc-engineer.json` — GRC engineering agent
- `~/.kiro/agents/grc-auditor.json` — audit workpaper agent  
- `~/.kiro/agents/grc-connector.json` — evidence collection agent
- `~/.cache/claude-grc/findings/` — evidence finding cache

## Quick setup on a new machine

```bash
# 1. Clone to ~/grc-engineering
git clone https://github.com/devedge09/kiro-grc-engineering.git ~/grc-engineering

# 2. Create Kiro directories
mkdir -p ~/.kiro/steering ~/.kiro/agents ~/.cache/claude-grc/findings

# 3. Copy Kiro configs (from this repo's kiro/ directory)
cp kiro/steering/grc-engineering.md ~/.kiro/steering/
cp kiro/agents/*.json ~/.kiro/agents/
```

Then in Kiro, just talk to it:
- `gap-assessment SOC2` — run a gap assessment
- `scan-iac ./terraform SOC2,NIST` — scan IaC for compliance issues
- `generate-policy access_control` — generate a policy document
- `map-controls AC-2 NIST-800-53` — map a control across frameworks
- `grc-frameworks` — list all 37 supported frameworks

## All original commands still work

See [upstream README](https://github.com/GRCEngClub/claude-grc-engineering#readme) for the full command reference. Everything in the original toolkit is preserved — only the dependency wiring changed.

## License

MIT — same as upstream. See [LICENSE](LICENSE).

# kiro-grc-engineering

> **Kiro-optimized fork of [GRCEngClub/claude-grc-engineering](https://github.com/GRCEngClub/claude-grc-engineering)**  
> Original work by the [GRC Engineering Club](https://grcengclub.com) — all credit to them.

This fork ports the GRC Engineering toolkit to work with [Kiro](https://kiro.dev) without requiring a Claude Code subscription or npm package installs. The only change is in the dependency wiring — all the real GRC content, framework runbooks, schemas, connectors, and command logic are 100% the work of GRCEngClub.

---

## Why this fork exists

The original toolkit is a Claude Code plugin. I don't have a Claude Code subscription, so I adapted it to run inside [Kiro](https://kiro.dev), which is free. The npm registry was also blocked in my environment, so I removed the three external dependencies (`js-yaml`, `dotenv`, `@octokit/rest`) and replaced them with Node.js built-in equivalents.

**I did not write the GRC content.** The framework runbooks, command definitions, connector plugins, schemas, and all compliance knowledge come entirely from GRCEngClub. Please ⭐ [their repo](https://github.com/GRCEngClub/claude-grc-engineering) and support their work.

---

## What changed from upstream

Only the Node.js wiring was changed — no GRC content was modified.

| Original dependency | Replacement | Reason |
|---|---|---|
| `js-yaml` (npm) | `yaml-shim.mjs` — inline YAML parser using Node built-ins | npm blocked |
| `dotenv` (npm) | Inline `.env` reader using `fs/promises` | npm blocked |
| `@octokit/rest` (npm) | `gh` CLI calls via `execSync` | npm blocked |
| CJS `require()` in 3 scripts | ESM `import` | required by `"type": "module"` |

Everything runs on **Node 22 built-ins alone** — no `npm install` needed.

---

## Kiro setup (quick start)

```bash
# 1. Clone to ~/grc-engineering
git clone https://github.com/devedge09/kiro-grc-engineering.git ~/grc-engineering

# 2. Create Kiro config directories and findings cache
mkdir -p ~/.kiro/steering ~/.kiro/agents ~/.cache/claude-grc/findings

# 3. Install the Kiro integration files
cp ~/grc-engineering/kiro/steering/grc-engineering.md ~/.kiro/steering/
cp ~/grc-engineering/kiro/agents/*.json ~/.kiro/agents/
```

Open Kiro and start using it:

```
gap-assessment SOC2
scan-iac ./terraform SOC2,NIST
generate-policy access_control
map-controls AC-2 NIST-800-53
grc-frameworks
```

The Kiro steering file (`~/.kiro/steering/grc-engineering.md`) is loaded automatically into every session — no plugin install command needed.

---

## Kiro integration files

| File | Purpose |
|---|---|
| `kiro/steering/grc-engineering.md` | Persistent context loaded into every Kiro session |
| `kiro/agents/grc-engineer.json` | Core GRC engineering agent (gap assessment, IaC scan, policy gen) |
| `kiro/agents/grc-auditor.json` | Audit workpaper and audit readiness agent |
| `kiro/agents/grc-connector.json` | Evidence collection agent (AWS, GitHub, GCP, Azure, etc.) |

---

## Full feature documentation

See the [original upstream README](https://github.com/GRCEngClub/claude-grc-engineering#readme) for the complete list of:
- All 37 supported compliance frameworks
- All 14 connector plugins (AWS, GCP, Azure, GitHub, Okta, Wiz, etc.)
- All commands and workflows
- OSCAL / FedRAMP tooling
- Architecture and data contract

---

## Credits & Attribution

All GRC content, framework runbooks, command logic, connector plugins, and schemas are the original work of:

**GRC Engineering Club**  
https://grcengclub.com  
https://github.com/GRCEngClub/claude-grc-engineering

This fork was created by [devedge09](https://github.com/devedge09) solely to make the toolkit usable in Kiro without a Claude Code subscription.

---

## License

**MIT** — same as upstream.

Original copyright: © 2025–2026 GRC Engineering Club contributors  
This fork's additions: © 2026 devedge09

The MIT license (full text in [LICENSE](LICENSE)) requires that the original copyright notice be kept in all copies. It is preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).

Additional third-party terms:
- SCF crosswalk data: CC BY-ND 4.0 — used verbatim, unmodified
- CIS Controls plugin: CC BY-SA 4.0 — see `plugins/frameworks/cis-controls/LICENSE-CIS.md`
- ISO/IEC, PCI DSS, HITRUST, and other framework plugins contain original implementation guidance only — normative text belongs to the respective standards bodies

See [LICENSE](LICENSE) for the full upstream license and third-party notices.

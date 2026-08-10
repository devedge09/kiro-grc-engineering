# Kiro Fork Changelog

All changes made in this fork relative to [GRCEngClub/claude-grc-engineering](https://github.com/GRCEngClub/claude-grc-engineering).

No GRC framework content was modified. All changes are in the Node.js runtime layer and Kiro-specific additions.

---

## [2026-08-10] — Initial Kiro port + enhancements

### Dependency fixes (makes the toolkit run without npm)

The upstream toolkit requires `js-yaml`, `dotenv`, and `@octokit/rest` from npm. These are blocked in restricted environments (including Kiro CLI's sandbox). All three were replaced with zero-dependency alternatives using Node.js built-ins.

| File | Change |
|---|---|
| `package.json` | Removed `js-yaml`, `dotenv`, `@octokit/rest` from dependencies |
| `plugins/grc-engineer/scripts/yaml-shim.mjs` | **New** — drop-in YAML `load()`/`loadAll()` parser using only Node built-ins. Supports block/flow mappings, sequences, quoted strings, block scalars, multi-document streams, comments, booleans, numbers, null. |
| `plugins/grc-engineer/scripts/scan-iac.js` | Converted CJS (`require`) → ESM (`import`); replaced `js-yaml` with `yaml-shim.mjs`; added `__dirname` shim for ESM |
| `plugins/grc-engineer/scripts/test-control.js` | Same CJS→ESM conversion |
| `plugins/grc-engineer/scripts/cross-framework-analyzer.js` | Same CJS→ESM conversion |
| `plugins/grc-engineer/scripts/monitor-continuous.js` | Replaced `import yaml from 'js-yaml'` with `yaml-shim.mjs` |
| `plugins/grc-engineer/scripts/record-automation-metrics.js` | Same |
| `plugins/grc-engineer/scripts/review-pr.js` | Replaced `dotenv` with inline `.env` reader using `fs/promises` |
| `plugins/grc-engineer/src/config-loader.js` | Replaced `js-yaml` with `../scripts/yaml-shim.mjs` |
| `plugins/grc-engineer/src/interview-question-generator.js` | Same |
| `plugins/grc-engineer/src/pr-reviewer.js` | Replaced `@octokit/rest` with `gh` CLI calls via `execSync`; preserves all compliance check logic |

**Why CJS→ESM?** `package.json` declares `"type": "module"`, making all `.js` files ESM. Three scripts used `require()` which throws in ESM scope. The upstream notes this as a known pre-existing bug in `AGENTS.md`.

---

### New: Kiro integration layer (`kiro/`)

| File | Purpose |
|---|---|
| `kiro/install.sh` | One-command idempotent installer. Checks prerequisites, creates directories, copies configs, runs smoke test. `bash kiro/install.sh` |
| `kiro/steering/grc-engineering.md` | Persistent context file loaded into every Kiro session. Tells Kiro what commands are available, how to use them, and where the files are. Equivalent to CLAUDE.md for Claude Code. |
| `kiro/agents/grc-engineer.json` | Kiro agent config with a substantive system prompt encoding GRC triage rules, severity thresholds, cross-mapping behaviour, and per-command procedures. |
| `kiro/agents/grc-auditor.json` | Kiro agent config with Big-4 audit rigour baked in: population/sample/exception structure, evidence freshness rules, workpaper template, audit readiness RAG assessment. |
| `kiro/agents/grc-connector.json` | Kiro agent config that enforces the evidence output contract: schema validation before reporting success, never writing partial findings, clear prerequisite checks. |
| `kiro/tools/findings-validator.js` | **New** — zero-dependency JSON Schema validator for finding files. Implements the subset of JSON Schema draft 2020-12 used by `finding.schema.json`. Replaces the upstream `ajv`-based test which can't run without npm. `node kiro/tools/findings-validator.js --dir=~/.cache/claude-grc/findings --recursive` |
| `kiro/hooks/validate-finding-on-write.js` | **New** — Kiro post-tool-use hook. Auto-validates any `.json` file written to `~/.cache/claude-grc/findings/` on every file write. Unique to this fork — Claude Code has no equivalent. |
| `.kiro/hooks.json` | Wires the validate-finding-on-write hook into Kiro's hook system. |
| `.kiro/specs/first-run-compliance-assessment.md` | **New** — Kiro spec that defines the full first-run workflow: prerequisites → GitHub evidence collection → findings validation → SOC 2 gap assessment → remediation backlog. |

---

### Improved: policy-generator.js

`plugins/grc-engineer/src/policy-generator.js` was rewritten from a keyword→template lookup (which returned the same hardcoded stub for anything not matching a handful of hardcoded patterns) to an **intent-driven generator** that:

- Parses the requirement text for resources (S3, EC2, RDS, IAM, KMS, CloudTrail, K8s, Azure Storage), concerns (encryption, public access, tags, MFA, least privilege, logging, rotation, HTTPS), and required tag names
- Generates real, runnable policy logic — not placeholder comments
- Produces test cases alongside the policy (OPA Rego tests, Sentinel tests)
- Infers and cites the correct control IDs (SOC 2, NIST, ISO 27001, PCI DSS) for the generated policy
- Supports all 5 formats: `rego`, `sentinel`, `aws-config`, `checkov`, `terraform` (CloudFormation Guard)

Before: `generate-policy "Ensure S3 buckets have Department tag" rego` → generic stub with a `# Add your policy logic here` comment.

After: Returns working OPA Rego with a `required_tags` set, a `deny` rule checking for missing tags, and test cases for both compliant and non-compliant resources.

---

### Attribution and legal

| File | Purpose |
|---|---|
| `NOTICE` | Documents original copyright (GRC Engineering Club, MIT), what changed, SCF CC BY-ND 4.0 attribution, CIS CC BY-SA 4.0 attribution |
| `README.md` | Replaced with a fork README that opens with upstream attribution, links to GRCEngClub, lists all changes, and provides Kiro setup instructions |
| `README.kiro.md` | Removed (content merged into README.md) |

---

## Upstream sync

To pull upstream changes into this fork:

```bash
cd ~/grc-engineering
git fetch origin main
git merge origin/main

# Re-check that no upstream change re-introduced js-yaml/dotenv/@octokit
grep -r "from 'js-yaml'\|from '@octokit\|import dotenv" \
  plugins/grc-engineer/scripts/ plugins/grc-engineer/src/
```

If the upstream added new scripts that use `js-yaml` or `@octokit/rest`, apply the same pattern: import from `./yaml-shim.mjs` and use `gh` CLI respectively.

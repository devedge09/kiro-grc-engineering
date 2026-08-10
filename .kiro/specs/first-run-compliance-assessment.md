# First-Run Compliance Assessment

## Overview
Guides a new user through their first complete GRC evidence collection and gap assessment cycle using only tools available without cloud credentials. Uses the GitHub connector (requires `gh` CLI auth) to collect real evidence from the user's own repositories, then runs a SOC 2 gap assessment and produces a prioritised remediation backlog.

This spec is designed to be run once when setting up the toolkit. It is idempotent — running it again will refresh the evidence.

---

## Requirements

### REQ-1: Prerequisites check
The agent MUST verify before starting:
- [ ] `node --version` returns v18 or higher
- [ ] `gh auth status` returns an active authenticated account
- [ ] `~/grc-engineering/plugins/grc-engineer/scripts/gap-assessment.js` exists
- [ ] `~/.cache/claude-grc/findings/` directory exists (create if not)

If any prerequisite fails, the agent MUST stop and give the specific remediation command rather than proceeding.

### REQ-2: GitHub evidence collection
The agent MUST run the GitHub inspector to collect evidence from the authenticated user's repositories:
- Read the setup runbook: `~/grc-engineering/plugins/connectors/github-inspector/commands/setup.md`
- Run setup: `bash ~/grc-engineering/plugins/connectors/github-inspector/scripts/setup.sh`
- Read the collect runbook: `~/grc-engineering/plugins/connectors/github-inspector/commands/collect.md`
- Run collection against the authenticated user's repos (scope: `@me`)
- Confirm findings are cached under `~/.cache/claude-grc/findings/github-inspector/`

### REQ-3: Findings validation
Before running the gap assessment, ALL collected findings MUST be validated:
- Run: `node ~/grc-engineering/kiro/tools/findings-validator.js --dir=~/.cache/claude-grc/findings --recursive`
- If any file fails validation, report the specific errors and stop — do not run gap assessment on invalid data

### REQ-4: SOC 2 gap assessment
Run a gap assessment against SOC 2 using only the GitHub findings:
- Command: `node ~/grc-engineering/plugins/grc-engineer/scripts/gap-assessment.js SOC2 --sources=github-inspector`
- Save the report to `~/grc-reports/first-run-soc2-<date>/`
- The report MUST include all six sections: header, coverage table, tier 1 blockers, tier 2 findings, tier 3 recommendations, remediation detail

### REQ-5: Remediation backlog
After the gap assessment, produce a prioritised remediation backlog:
- List Tier 1 findings first (critical/high) with exact fix commands or Terraform snippets
- For each finding: resource name, control ID, severity, effort estimate, fix
- Output as a markdown table saved to `~/grc-reports/first-run-soc2-<date>/remediation-backlog.md`

### REQ-6: Next steps summary
End with a concrete "what to do next" list tailored to what was found:
- Which other connectors to set up (AWS if they have credentials, etc.)
- Which Tier 1 findings to fix first and why
- When to re-run the assessment (recommend 7-day cadence minimum)
- How to add more frameworks to the assessment

---

## Success criteria
- GitHub connector collected findings from at least 1 repository
- All findings passed schema validation
- Gap assessment report was written to disk
- Remediation backlog was written to disk
- User has a clear, ordered list of next actions

## Out of scope
- Fixing the findings (that is the user's job)
- Collecting evidence from AWS, GCP, Azure, or any paid SaaS tool
- Publishing the report anywhere

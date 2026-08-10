#!/usr/bin/env bash
# kiro/install.sh — one-command setup for grckit
# Usage: bash kiro/install.sh [--repo-dir=<path>]
#
# What it does:
#   1. Verifies prerequisites (Node ≥18, git, kiro-cli)
#   2. Resolves the repo root (works whether cloned fresh or run in-place)
#   3. Creates ~/.kiro/steering, ~/.kiro/agents, ~/.cache/claude-grc/findings
#   4. Copies Kiro steering + agent configs (idempotent — backs up existing)
#   5. Runs a quick smoke test (map-control on a sample file)
#   6. Prints a "what to try next" summary
#
# Idempotent: safe to run multiple times.

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
err()  { echo -e "${RED}✗${RESET}  $*" >&2; }
info() { echo -e "${CYAN}→${RESET} $*"; }
hdr()  { echo -e "\n${BOLD}$*${RESET}"; }

# ─── Resolve repo root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Allow override via --repo-dir=<path>
for arg in "$@"; do
  if [[ "$arg" == --repo-dir=* ]]; then
    REPO_DIR="${arg#--repo-dir=}"
  fi
done

hdr "grckit installer"
info "Repo: $REPO_DIR"

# ─── 1. Prerequisites ─────────────────────────────────────────────────────────
hdr "1/5  Checking prerequisites"

# Node.js ≥ 18
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install from https://nodejs.org (v18 or later)."
  exit 1
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR="${NODE_VER%%.*}"
if (( NODE_MAJOR < 18 )); then
  err "Node.js v$NODE_VER found but v18+ is required."
  exit 1
fi
ok "Node.js v$NODE_VER"

# git
if ! command -v git &>/dev/null; then
  err "git not found."
  exit 1
fi
ok "git $(git --version | awk '{print $3}')"

# kiro-cli (warn only — doesn't block install)
if command -v kiro-cli &>/dev/null || command -v kiro-cli-chat &>/dev/null; then
  ok "kiro-cli found"
else
  warn "kiro-cli not found in PATH. Install from https://kiro.dev — configs will still be written."
fi

# gh CLI (warn only — needed only for review-pr and github-inspector)
if command -v gh &>/dev/null; then
  ok "gh CLI $(gh --version | head -1 | awk '{print $3}')"
else
  warn "gh CLI not found — review-pr and github-inspector commands won't work without it."
fi

# ─── 2. Verify repo structure ─────────────────────────────────────────────────
hdr "2/5  Verifying repo"

REQUIRED_PATHS=(
  "plugins/grc-engineer/scripts/gap-assessment.js"
  "plugins/grc-engineer/scripts/yaml-shim.mjs"
  "plugins/grc-engineer/scripts/map-control.js"
  "schemas/finding.schema.json"
  "kiro/steering/grc-engineering.md"
  "kiro/agents/grc-engineer.json"
)

for p in "${REQUIRED_PATHS[@]}"; do
  if [[ ! -f "$REPO_DIR/$p" ]]; then
    err "Expected file missing: $REPO_DIR/$p"
    err "Re-clone from https://github.com/devedge09/grckit"
    exit 1
  fi
done
ok "Repo structure verified"

# ─── 3. Create Kiro directories ───────────────────────────────────────────────
hdr "3/5  Creating directories"

KIRO_STEERING="$HOME/.kiro/steering"
KIRO_AGENTS="$HOME/.kiro/agents"
FINDINGS_CACHE="$HOME/.cache/claude-grc/findings"
SCF_CACHE="$HOME/.cache/claude-grc/scf"

for d in "$KIRO_STEERING" "$KIRO_AGENTS" "$FINDINGS_CACHE" "$SCF_CACHE"; do
  mkdir -p "$d"
  ok "  $d"
done

# ─── 4. Install Kiro configs ──────────────────────────────────────────────────
hdr "4/5  Installing Kiro configs"

install_file() {
  local src="$1" dst="$2" label="$3"
  if [[ -f "$dst" ]]; then
    # Back up only if content differs
    if ! cmp -s "$src" "$dst"; then
      cp "$dst" "${dst}.bak.$(date +%Y%m%d%H%M%S)"
      warn "  Backed up existing $label"
    fi
  fi
  cp "$src" "$dst"
  ok "  $label → $dst"
}

install_file "$REPO_DIR/kiro/steering/grc-engineering.md" \
             "$KIRO_STEERING/grc-engineering.md" \
             "steering/grc-engineering.md"

for agent_file in "$REPO_DIR"/kiro/agents/*.json; do
  agent_name="$(basename "$agent_file")"
  install_file "$agent_file" "$KIRO_AGENTS/$agent_name" "agents/$agent_name"
done

# ─── 5. Smoke test ────────────────────────────────────────────────────────────
hdr "5/5  Smoke test"

SAMPLE="$REPO_DIR/examples/sample-evidence/s3-data-bucket.tf"
if [[ -f "$SAMPLE" ]]; then
  if node "$REPO_DIR/plugins/grc-engineer/scripts/map-control.js" "$SAMPLE" soc2 &>/dev/null; then
    ok "map-control smoke test passed"
  else
    warn "map-control returned non-zero — check Node.js version"
  fi
else
  warn "No sample IaC file found for smoke test — skipping"
fi

GAP_OUT=$(node "$REPO_DIR/plugins/grc-engineer/scripts/gap-assessment.js" SOC2 --quiet 2>&1 || true)
if echo "$GAP_OUT" | grep -q "No cached findings"; then
  ok "gap-assessment correctly reports no findings yet"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Installation complete!${RESET}"
echo ""
echo -e "Toolkit installed at: ${CYAN}$REPO_DIR${RESET}"
echo -e "Kiro steering:        ${CYAN}$KIRO_STEERING/grc-engineering.md${RESET}"
echo -e "Kiro agents:          ${CYAN}$KIRO_AGENTS/${RESET}"
echo -e "Findings cache:       ${CYAN}$FINDINGS_CACHE/${RESET}"
echo ""
echo -e "${BOLD}What to try next:${RESET}"
echo ""
echo -e "  ${CYAN}# If you have AWS credentials:${RESET}"
echo -e "  bash $REPO_DIR/plugins/connectors/aws-inspector/scripts/setup.sh"
echo ""
echo -e "  ${CYAN}# If you have gh CLI authenticated:${RESET}"
echo -e "  bash $REPO_DIR/plugins/connectors/github-inspector/scripts/setup.sh"
echo ""
echo -e "  ${CYAN}# Then in Kiro chat:${RESET}"
echo -e "  gap-assessment SOC2"
echo -e "  scan-iac ./terraform SOC2,NIST"
echo -e "  generate-policy access_control"
echo -e "  grc-frameworks"
echo ""
echo -e "  ${CYAN}# Validate a findings file:${RESET}"
echo -e "  node $REPO_DIR/kiro/tools/findings-validator.js ~/.cache/claude-grc/findings/**/*.json"
echo ""

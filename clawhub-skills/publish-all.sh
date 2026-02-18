#!/usr/bin/env bash
set -euo pipefail

# Publish all skills to ClawHub registry
# Usage: ./publish-all.sh [--version 1.0.0] [--changelog "message"] [--dry-run]
#
# Prerequisites:
#   npm i -g clawhub
#   clawhub login

VERSION="${VERSION:-1.0.0}"
CHANGELOG="${CHANGELOG:-Initial ClawHub release}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --changelog) CHANGELOG="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SKILLS=(
  "blog-publisher:Blog Publisher"
  "site-deployer:Site Deployer"
  "voice-clone:Voice Clone"
  "research-scout:Research Scout"
  "creative-mode:Creative Mode"
  "agent-manager:Agent Manager"
  "gh-issues:GitHub Issues Auto-Fix"
  "telegram-always-on:Telegram Always-On Setup"
)

echo "Publishing ${#SKILLS[@]} skills to ClawHub (v${VERSION})"
echo "---"

for entry in "${SKILLS[@]}"; do
  slug="${entry%%:*}"
  name="${entry#*:}"
  skill_dir="${SCRIPT_DIR}/${slug}"

  if [[ ! -d "$skill_dir" ]]; then
    echo "SKIP  ${slug} — directory not found"
    continue
  fi

  if $DRY_RUN; then
    echo "DRY   ${slug} — would publish as '${name}' v${VERSION}"
  else
    echo "PUB   ${slug} ..."
    clawhub publish "$skill_dir" \
      --slug "$slug" \
      --name "$name" \
      --version "$VERSION" \
      --changelog "$CHANGELOG"
    echo "  OK  ${slug} v${VERSION}"
  fi
done

echo "---"
echo "Done. Users can install with: clawhub install <skill-name>"

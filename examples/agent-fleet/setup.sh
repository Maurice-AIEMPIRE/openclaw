#!/usr/bin/env bash
set -euo pipefail

# ─── Agent Fleet Setup Script ───
# Deploys a 3-agent fleet (Ops, Research, Builder) to ~/.openclaw/
# Requires: OpenClaw installed, MiniMax API key, Telegram bot token

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_HOME="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

echo "=== Agent Fleet Setup ==="
echo ""

# ─── Check prerequisites ───
if ! command -v openclaw &>/dev/null && ! command -v node &>/dev/null; then
  echo "ERROR: openclaw or node not found. Install OpenClaw first:"
  echo "  curl -fsSL https://openclaw.ai/install.sh | bash"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install Node 22+:"
  echo "  brew install node"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "ERROR: Node.js $NODE_VERSION found, but 22+ is required."
  exit 1
fi

# ─── Check for required env vars ───
if [ -z "${MINIMAX_API_KEY:-}" ]; then
  echo "WARNING: MINIMAX_API_KEY not set."
  echo "  Set it: export MINIMAX_API_KEY='sk-...'"
  echo "  Or add it to ~/.openclaw/openclaw.json env block after setup."
  echo ""
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "WARNING: TELEGRAM_BOT_TOKEN not set."
  echo "  Get one from @BotFather on Telegram."
  echo "  Set it: export TELEGRAM_BOT_TOKEN='123456789:ABC...'"
  echo ""
fi

# ─── Deploy workspace files ───
echo "Deploying agent workspaces..."

for agent in ops research builder; do
  WS_DIR="$OPENCLAW_HOME/workspace-$agent"
  SRC_DIR="$SCRIPT_DIR/workspace-$agent"

  if [ -d "$WS_DIR" ]; then
    echo "  workspace-$agent: EXISTS (skipping to avoid overwriting your data)"
  else
    mkdir -p "$WS_DIR"
    cp "$SRC_DIR"/*.md "$WS_DIR/"
    echo "  workspace-$agent: CREATED"
  fi
done

# ─── Deploy config ───
CONFIG_FILE="$OPENCLAW_HOME/openclaw.json"

if [ -f "$CONFIG_FILE" ]; then
  echo ""
  echo "Config file already exists: $CONFIG_FILE"
  echo "Example fleet config saved to: $SCRIPT_DIR/openclaw.json"
  echo "Merge manually or backup and replace."
else
  # Substitute env vars into config
  if [ -n "${MINIMAX_API_KEY:-}" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
    sed \
      -e "s|\${MINIMAX_API_KEY}|${MINIMAX_API_KEY}|g" \
      -e "s|\${TELEGRAM_BOT_TOKEN}|${TELEGRAM_BOT_TOKEN}|g" \
      "$SCRIPT_DIR/openclaw.json" > "$CONFIG_FILE"
    echo "Config deployed: $CONFIG_FILE"
  else
    cp "$SCRIPT_DIR/openclaw.json" "$CONFIG_FILE"
    echo "Config deployed (template): $CONFIG_FILE"
    echo "  Edit $CONFIG_FILE to add your API keys."
  fi
fi

# ─── Check LM Studio ───
echo ""
echo "Checking LM Studio..."
if curl -sf http://127.0.0.1:1234/v1/models >/dev/null 2>&1; then
  echo "  LM Studio: RUNNING"
  MODELS=$(curl -sf http://127.0.0.1:1234/v1/models | python3 -c "import sys,json; data=json.load(sys.stdin); print(', '.join(m['id'] for m in data.get('data',[])) or 'no models loaded')" 2>/dev/null || echo "unknown")
  echo "  Models: $MODELS"
else
  echo "  LM Studio: NOT RUNNING"
  echo "  Heartbeats will fall back to MiniMax (costs tokens)."
  echo "  Start LM Studio and load a 3-4B model (Qwen 3 4B recommended)."
fi

# ─── Summary ───
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start the gateway:    openclaw gateway"
echo "  2. Install as service:   openclaw service install"
echo "  3. Open dashboard:       openclaw dashboard"
echo "  4. Pair Telegram:        Send the pairing key to your bot"
echo ""
echo "Agent fleet:"
echo "  Ops      — Telegram, heartbeat every 30m (content + revenue)"
echo "  Research — WebChat, heartbeat every 2h  (model scout + hack hunter)"
echo "  Builder  — WebChat, heartbeat every 4h  (integration + deployment)"
echo ""
echo "Monthly cost: ~$50 (MiniMax) + $0 (local heartbeats)"

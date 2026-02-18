---
name: telegram-always-on
description: Set up OpenClaw gateway to always run and auto-restart, keeping Telegram (and all other channels) permanently connected. Installs PM2 (Linux/macOS) or registers a systemd service or macOS LaunchAgent. Use when the user wants the gateway to survive reboots and auto-recover from crashes.
metadata: { "openclaw": { "requires": { "bins": ["node", "npm"] } } }
---

# Telegram Always-On Setup

Keep the OpenClaw gateway — and Telegram — running permanently, surviving reboots and crashes.

---

## Step 0 — Confirm prerequisites

Before starting, check:

```bash
node --version      # must be ≥ 22.12
which pnpm || npm i -g pnpm
cat ~/.openclaw/openclaw.json 2>/dev/null | grep -A3 telegram
echo $TELEGRAM_BOT_TOKEN
```

If `TELEGRAM_BOT_TOKEN` is empty and not in config, stop and ask the user to provide it. Then write it to `~/.openclaw/.env` (create if missing):

```bash
echo 'TELEGRAM_BOT_TOKEN=<token>' >> ~/.openclaw/.env
```

---

## Step 1 — Detect OS and choose method

Run:

```bash
uname -s          # Darwin = macOS, Linux = Linux
systemctl --version 2>/dev/null && echo "has systemd" || echo "no systemd"
which pm2 || echo "pm2 not installed"
```

Decision tree:

- **macOS** → use LaunchAgent (Option A)
- **Linux + systemd** → use systemd user service (Option B)
- **Linux without systemd / any OS** → use PM2 (Option C)

Present the detected option to the user and confirm before proceeding.

---

## Option A — macOS LaunchAgent

```bash
# 1. Find openclaw dir
OPENCLAW_DIR="$(pwd)"   # or ask user

# 2. Create logs dir
mkdir -p "$OPENCLAW_DIR/logs"

# 3. Install plist
PLIST_SRC="$OPENCLAW_DIR/scripts/ai.openclaw.gateway.plist"
PLIST_DST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"

sed "s|OPENCLAW_DIR_PLACEHOLDER|$OPENCLAW_DIR|g" "$PLIST_SRC" > "$PLIST_DST"

# 4. Inject token (if not already in env)
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
  /usr/libexec/PlistBuddy -c \
    "Set :EnvironmentVariables:TELEGRAM_BOT_TOKEN $TELEGRAM_BOT_TOKEN" \
    "$PLIST_DST"
fi

# 5. Load
launchctl unload "$PLIST_DST" 2>/dev/null || true
launchctl load -w "$PLIST_DST"
launchctl list | grep openclaw
```

**Verify:**

```bash
tail -f ~/openclaw/logs/gateway.log
```

---

## Option B — systemd user service (Linux)

```bash
# 1. Copy service file
OPENCLAW_DIR="$(pwd)"
mkdir -p ~/.config/systemd/user
cp "$OPENCLAW_DIR/scripts/openclaw.service" ~/.config/systemd/user/openclaw.service

# 2. Set working directory (patch the service file)
sed -i "s|WorkingDirectory=%h/openclaw|WorkingDirectory=$OPENCLAW_DIR|" \
  ~/.config/systemd/user/openclaw.service

# 3. Create env file with token
mkdir -p ~/.openclaw
echo "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN" > ~/.openclaw/.env

# 4. Enable and start
systemctl --user daemon-reload
systemctl --user enable --now openclaw.service
systemctl --user status openclaw.service
```

**Log streaming:**

```bash
journalctl --user -u openclaw -f
```

**Enable linger** (run even when logged out — servers/headless):

```bash
loginctl enable-linger "$USER"
```

---

## Option C — PM2 (all platforms)

```bash
# 1. Install PM2
npm install -g pm2

# 2. Start via ecosystem config
cd /path/to/openclaw
TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" pm2 start ecosystem.config.cjs

# 3. Save process list
pm2 save

# 4. Register startup hook (follow the printed command)
pm2 startup
# → Run the printed sudo command, e.g.:
#   sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

# 5. Verify
pm2 status
pm2 logs openclaw --lines 50
```

---

## Step 2 — Verify Telegram is connecting

After the gateway starts, check logs for Telegram connection:

**PM2:**

```bash
pm2 logs openclaw | grep -i telegram
```

**systemd:**

```bash
journalctl --user -u openclaw | grep -i telegram
```

**macOS:**

```bash
grep -i telegram ~/openclaw/logs/gateway.log | tail -20
```

You should see lines like:

```
[telegram] Bot started (long-polling)
[telegram] Listening for updates...
```

If instead you see:

- `No bot token` → check `TELEGRAM_BOT_TOKEN` in your env/config
- `409 Conflict` → another instance is running; stop duplicates
- `ETIMEDOUT` or IPv6 issues → add to `openclaw.json`:
  ```json
  { "channels": { "telegram": { "network": { "autoSelectFamily": false } } } }
  ```

---

## Step 3 — Test the connection

1. Open Telegram, find your bot by username
2. Send `/start`
3. If DM policy is `"pairing"`: the gateway will show a pairing code — approve it
4. Send a test message — you should get a reply within seconds

---

## Troubleshooting

| Symptom                        | Cause                 | Fix                                             |
| ------------------------------ | --------------------- | ----------------------------------------------- |
| Bot doesn't see group messages | Privacy mode ON       | `/setprivacy` in @BotFather → Disable           |
| Hangs on startup (IPv6)        | Node 22 IPv6 DNS      | Set `network.autoSelectFamily: false` in config |
| 409 Conflict error             | Multiple instances    | Kill all `openclaw` processes, restart one      |
| Crashes on start               | Missing token         | Set `TELEGRAM_BOT_TOKEN` in env/config          |
| Messages delayed               | Webhook set elsewhere | Call `deleteWebhook` via API or reconfigure     |

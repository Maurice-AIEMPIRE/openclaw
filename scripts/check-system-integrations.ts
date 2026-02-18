#!/usr/bin/env tsx
/**
 * System Integration Check Script
 *
 * Verifies that core OpenClaw integrations are properly configured and reachable:
 * - Telegram bot connectivity (probe via getMe API)
 * - Build integrity
 * - Channel account configuration summary
 *
 * Usage:
 *   pnpm tsx scripts/check-system-integrations.ts
 *   pnpm tsx scripts/check-system-integrations.ts --json
 *   pnpm tsx scripts/check-system-integrations.ts --bot-only
 */

import process from "node:process";
import { listChannelPlugins } from "../src/channels/plugins/index.js";
import { loadConfig } from "../src/config/config.js";
import { listEnabledTelegramAccounts, resolveTelegramAccount } from "../src/telegram/accounts.js";
import { probeTelegram } from "../src/telegram/probe.js";

const PROBE_TIMEOUT_MS = 15_000;

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
  details?: Record<string, unknown>;
}

const results: CheckResult[] = [];

function log(prefix: string, msg: string) {
  const icon = prefix === "ok" ? "[OK]" : prefix === "warn" ? "[WARN]" : "[FAIL]";
  console.log(`${icon} ${msg}`);
}

// --- 1. Config loading ---
let cfg: ReturnType<typeof loadConfig> | null = null;
try {
  cfg = loadConfig();
  results.push({
    name: "config",
    status: "ok",
    message: "OpenClaw config loaded successfully",
  });
} catch (err) {
  results.push({
    name: "config",
    status: "fail",
    message: `Failed to load config: ${String(err)}`,
  });
}

// --- 2. Channel plugins discovery ---
if (cfg) {
  const plugins = listChannelPlugins();
  const enabledChannels: string[] = [];
  const disabledChannels: string[] = [];

  for (const plugin of plugins) {
    const accountIds = plugin.config.listAccountIds(cfg);
    if (accountIds.length > 0) {
      enabledChannels.push(`${plugin.id} (${accountIds.length} account(s))`);
    } else {
      disabledChannels.push(plugin.id);
    }
  }

  results.push({
    name: "channels",
    status: enabledChannels.length > 0 ? "ok" : "warn",
    message:
      enabledChannels.length > 0
        ? `Configured channels: ${enabledChannels.join(", ")}`
        : "No channels configured",
    details: { enabled: enabledChannels, disabled: disabledChannels },
  });
}

// --- 3. Telegram bot probe ---
if (cfg) {
  const telegramAccounts = listEnabledTelegramAccounts(cfg);

  if (telegramAccounts.length === 0) {
    // Try resolving default account for diagnostics
    const defaultAccount = resolveTelegramAccount({ cfg });
    if (defaultAccount.token) {
      telegramAccounts.push(defaultAccount);
    }
  }

  if (telegramAccounts.length === 0) {
    results.push({
      name: "telegram",
      status: "warn",
      message:
        "No Telegram bot token configured. Set TELEGRAM_BOT_TOKEN or configure channels.telegram.botToken.",
    });
  } else {
    for (const account of telegramAccounts) {
      const label = `telegram:${account.accountId}`;
      if (!account.token) {
        results.push({
          name: label,
          status: "fail",
          message: `Account "${account.accountId}" has no token (source: ${account.tokenSource})`,
        });
        continue;
      }

      try {
        const probeResult = await probeTelegram(
          account.token,
          PROBE_TIMEOUT_MS,
          account.config.proxy,
        );

        if (probeResult.ok) {
          const botUsername = probeResult.bot?.username
            ? `@${probeResult.bot.username}`
            : "unknown";
          results.push({
            name: label,
            status: "ok",
            message: `Bot ${botUsername} reachable (${probeResult.elapsedMs}ms)`,
            details: {
              botId: probeResult.bot?.id,
              botUsername: probeResult.bot?.username,
              canJoinGroups: probeResult.bot?.canJoinGroups,
              canReadAllGroupMessages: probeResult.bot?.canReadAllGroupMessages,
              webhookUrl: probeResult.webhook?.url || "(none - polling mode)",
              elapsedMs: probeResult.elapsedMs,
              accountId: account.accountId,
              tokenSource: account.tokenSource,
              enabled: account.enabled,
            },
          });
        } else {
          results.push({
            name: label,
            status: "fail",
            message: `Bot probe failed: ${probeResult.error ?? `HTTP ${probeResult.status}`}`,
            details: {
              status: probeResult.status,
              error: probeResult.error,
              elapsedMs: probeResult.elapsedMs,
            },
          });
        }
      } catch (err) {
        results.push({
          name: label,
          status: "fail",
          message: `Probe exception: ${String(err)}`,
        });
      }
    }
  }
}

// --- 4. Build check ---
try {
  const { existsSync } = await import("node:fs");
  const distExists = existsSync("dist/index.js");
  results.push({
    name: "build",
    status: distExists ? "ok" : "warn",
    message: distExists
      ? "Build artifacts present (dist/index.js)"
      : "No build artifacts found - run 'pnpm build'",
  });
} catch (err) {
  results.push({
    name: "build",
    status: "warn",
    message: `Could not check build: ${String(err)}`,
  });
}

// --- 5. Node.js version ---
const nodeMajor = Number(process.versions.node.split(".")[0]);
results.push({
  name: "node",
  status: nodeMajor >= 22 ? "ok" : "warn",
  message: `Node.js ${process.versions.node}${nodeMajor < 22 ? " (22+ recommended)" : ""}`,
});

// --- Output ---
const jsonFlag = process.argv.includes("--json");

if (jsonFlag) {
  console.log(JSON.stringify({ ts: Date.now(), results }, null, 2));
} else {
  console.log("\n=== OpenClaw System Integration Check ===\n");

  for (const r of results) {
    log(r.status, `${r.name}: ${r.message}`);
    if (r.details && process.argv.includes("--verbose")) {
      for (const [key, value] of Object.entries(r.details)) {
        console.log(`       ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  const failed = results.filter((r) => r.status === "fail");
  const warned = results.filter((r) => r.status === "warn");
  const passed = results.filter((r) => r.status === "ok");

  console.log(
    `\nSummary: ${passed.length} passed, ${warned.length} warnings, ${failed.length} failed`,
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}
